import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import {
  ChapterGenerationResult,
  OutlineGenerationResult,
} from '../common/types/ai.types';

type ProviderName = 'gemini' | 'openai' | 'claude';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly geminiClient?: GoogleGenerativeAI;
  private readonly openAiClient?: OpenAI;
  private readonly anthropicClient?: Anthropic;

  constructor(private readonly configService: ConfigService) {
    const geminiApiKey = this.configService.get<string>('GEMINI_API_KEY');
    const openAiApiKey = this.configService.get<string>('OPENAI_API_KEY');
    const claudeApiKey = this.configService.get<string>('CLAUDE_API_KEY');

    if (geminiApiKey) {
      this.geminiClient = new GoogleGenerativeAI(geminiApiKey);
    }

    if (openAiApiKey) {
      this.openAiClient = new OpenAI({ apiKey: openAiApiKey });
    }

    if (claudeApiKey) {
      this.anthropicClient = new Anthropic({ apiKey: claudeApiKey });
    }
  }

  async generateOutline(input: {
    title: string;
    notesOnOutlineBefore: string;
    existingOutline?: string | null;
    notesOnOutlineAfter?: string | null;
  }): Promise<OutlineGenerationResult> {
    const prompt = `
Return strict JSON only.
Schema:
{
  "outlineText": "markdown outline",
  "chapters": [{"number":1,"title":"string","description":"string"}]
}

Task:
Create a concise but high-quality non-fiction book outline.
Book title: ${input.title}
Pre-outline editor notes: ${input.notesOnOutlineBefore}
Existing outline: ${input.existingOutline ?? 'none'}
Post-outline editor notes: ${input.notesOnOutlineAfter ?? 'none'}

Rules:
- Produce 5 to 8 chapters.
- Make chapter numbering sequential starting at 1.
- Keep the outline practical and logically progressive.
- If post-outline notes exist, use them to improve the outline.
`.trim();

    const rawResult = await this.runJsonPrompt(prompt);
    return this.normalizeOutlineResult(rawResult);
  }

  async generateChapter(input: {
    bookTitle: string;
    chapterNumber: number;
    chapterTitle: string;
    chapterDescription?: string | null;
    outlineText?: string | null;
    priorChapterSummaries: string[];
    chapterNotes?: string | null;
  }): Promise<ChapterGenerationResult> {
    const prompt = `
Return strict JSON only.
Schema:
{
  "content": "markdown chapter content",
  "summary": "a concise summary in 2 to 4 sentences"
}

Write a full chapter for a book.
Book title: ${input.bookTitle}
Chapter number: ${input.chapterNumber}
Chapter title: ${input.chapterTitle}
Chapter direction: ${input.chapterDescription ?? 'none'}
Book outline: ${input.outlineText ?? 'none'}
Previous chapter summaries:
${input.priorChapterSummaries.length > 0 ? input.priorChapterSummaries.join('\n\n') : 'No previous chapters yet.'}
Editor notes for this chapter: ${input.chapterNotes ?? 'none'}

Rules:
- Write in polished markdown with headings and readable paragraphs.
- Keep continuity with the previous chapter summaries.
- Make the chapter actionable and self-contained.
- If editor notes exist, follow them closely.
- The summary must help the next chapter stay consistent.
`.trim();

    const rawResult = await this.runJsonPrompt(prompt);
    return this.normalizeChapterResult(rawResult);
  }

  private async runJsonPrompt(prompt: string): Promise<unknown> {
    const providers: ProviderName[] = ['gemini', 'openai', 'claude'];
    const failures: string[] = [];

    for (const provider of providers) {
      try {
        const text = await this.generateTextWithProvider(provider, prompt);
        return JSON.parse(this.extractJson(text));
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown provider error';
        failures.push(`${provider}: ${message}`);
        this.logger.warn(`Provider ${provider} failed: ${message}`);
      }
    }

    throw new InternalServerErrorException(
      `All AI providers failed. ${failures.join(' | ')}`,
    );
  }

  private async generateTextWithProvider(
    provider: ProviderName,
    prompt: string,
  ): Promise<string> {
    if (provider === 'gemini' && this.geminiClient) {
      const model =
        this.configService.get<string>('app.geminiModel') ??
        'gemini-1.5-pro-latest';
      const result = await this.geminiClient
        .getGenerativeModel({ model })
        .generateContent(prompt);
      return result.response.text();
    }

    if (provider === 'openai' && this.openAiClient) {
      const model =
        this.configService.get<string>('app.openAiModel') ?? 'gpt-4o-mini';
      const response = await this.openAiClient.responses.create({
        model,
        input: prompt,
      });
      return response.output_text;
    }

    if (provider === 'claude' && this.anthropicClient) {
      const model =
        this.configService.get<string>('app.claudeModel') ??
        'claude-3-5-sonnet-20241022';
      const response = await this.anthropicClient.messages.create({
        model,
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }],
      });

      const textBlock = response.content.find((item) => item.type === 'text');
      if (!textBlock || textBlock.type !== 'text') {
        throw new Error('Claude returned no text block');
      }

      return textBlock.text;
    }

    throw new Error(`Provider ${provider} is not configured`);
  }

  private extractJson(text: string) {
    const trimmed = text.trim();

    if (trimmed.startsWith('{')) {
      return trimmed;
    }

    const fencedMatch = trimmed.match(/```json\s*([\s\S]*?)```/i);
    if (fencedMatch?.[1]) {
      return fencedMatch[1].trim();
    }

    const braceStart = trimmed.indexOf('{');
    const braceEnd = trimmed.lastIndexOf('}');
    if (braceStart >= 0 && braceEnd > braceStart) {
      return trimmed.slice(braceStart, braceEnd + 1);
    }

    throw new Error('No JSON object found in provider response');
  }

  private normalizeOutlineResult(value: unknown): OutlineGenerationResult {
    if (!value || typeof value !== 'object') {
      throw new Error('Outline response was not an object');
    }

    const record = value as Record<string, unknown>;
    const outlineText =
      typeof record.outlineText === 'string'
        ? record.outlineText
        : typeof record.outline === 'string'
          ? record.outline
          : '';

    const rawChapters = Array.isArray(record.chapters)
      ? record.chapters
      : this.extractChaptersFromOutlineText(outlineText);

    const chapters = rawChapters
      .map((chapter, index) => this.normalizeOutlineChapter(chapter, index))
      .filter(
        (
          chapter,
        ): chapter is { number: number; title: string; description: string } =>
          Boolean(chapter),
      );

    if (!outlineText || chapters.length === 0) {
      throw new Error('Outline response did not include usable chapters');
    }

    return {
      outlineText,
      chapters,
    };
  }

  private normalizeOutlineChapter(chapter: unknown, index: number) {
    if (typeof chapter === 'string' && chapter.trim()) {
      return {
        number: index + 1,
        title: chapter.trim(),
        description: `Focus on ${chapter.trim()}.`,
      };
    }

    if (!chapter || typeof chapter !== 'object') {
      return null;
    }

    const record = chapter as Record<string, unknown>;
    const title = this.readString(record.title) ?? this.readString(record.name);
    if (!title) {
      return null;
    }

    return {
      number:
        typeof record.number === 'number' ? record.number : index + 1,
      title,
      description:
        this.readString(record.description) ??
        this.readString(record.summary) ??
        `Focus on ${title}.`,
    };
  }

  private extractChaptersFromOutlineText(outlineText: string) {
    return outlineText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => /^\d+[\).\s-]+/.test(line) || /^#+\s+/.test(line))
      .map((line) =>
        line.replace(/^#+\s+/, '').replace(/^\d+[\).\s-]+/, '').trim(),
      )
      .filter(Boolean);
  }

  private normalizeChapterResult(value: unknown): ChapterGenerationResult {
    if (!value || typeof value !== 'object') {
      throw new Error('Chapter response was not an object');
    }

    const record = value as Record<string, unknown>;
    const content =
      this.readString(record.content) ?? this.readString(record.chapterText);
    const summary =
      this.readString(record.summary) ??
      this.readString(record.chapterSummary) ??
      this.summarizeFromContent(content);

    if (!content || !summary) {
      throw new Error('Chapter response was missing content or summary');
    }

    return {
      content,
      summary,
    };
  }

  private summarizeFromContent(content?: string) {
    if (!content) {
      return undefined;
    }

    const sentences = content
      .replace(/\s+/g, ' ')
      .split(/(?<=[.!?])\s+/)
      .slice(0, 3)
      .join(' ')
      .trim();

    return sentences || undefined;
  }

  private readString(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly resendClient?: Resend;

  constructor(private readonly configService: ConfigService) {
    const resendApiKey = this.configService.get<string>('RESEND_API_KEY');

    if (resendApiKey) {
      this.resendClient = new Resend(resendApiKey);
    }
  }

  async sendWorkflowEmail(input: {
    title: string;
    subject: string;
    message: string;
  }) {
    if (!this.resendClient) {
      this.logger.warn(
        `Skipping email for "${input.title}" because RESEND_API_KEY is not configured.`,
      );
      return;
    }

    try {
      await this.resendClient.emails.send({
        from: this.configService.get<string>('app.resendFrom')!,
        to: this.configService.get<string>('app.notificationTo')!,
        subject: input.subject,
        html: `<div style="font-family:Arial,sans-serif"><h2>${input.title}</h2><p>${input.message}</p></div>`,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown email failure';
      this.logger.warn(`Email send failed: ${message}`);
    }
  }
}

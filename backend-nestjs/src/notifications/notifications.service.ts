import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly resendClient?: Resend;
  private readonly fromAddress: string;
  private readonly toAddress: string;

  constructor(private readonly configService: ConfigService) {
    const resendApiKey = this.configService.get<string>('RESEND_API_KEY');
    this.fromAddress =
      this.configService.get<string>('app.resendFrom') ?? 'onboarding@resend.dev';
    this.toAddress =
      this.configService.get<string>('app.notificationTo') ?? '';

    if (resendApiKey) {
      this.resendClient = new Resend(resendApiKey);
    } else {
      this.logger.warn('RESEND_API_KEY is not set — email notifications are disabled.');
    }
  }

  async sendWorkflowEmail(input: {
    title: string;
    subject: string;
    message: string;
  }) {
    if (!this.resendClient) {
      this.logger.warn(`Skipping email for "${input.title}": RESEND_API_KEY not configured.`);
      return;
    }

    if (!this.toAddress) {
      this.logger.warn(`Skipping email for "${input.title}": NOTIFICATION_TO is not set.`);
      return;
    }

    this.logger.log(
      `Sending email — from: ${this.fromAddress}, to: ${this.toAddress}, subject: "${input.subject}"`,
    );

    const { data, error } = await this.resendClient.emails.send({
      from: this.fromAddress,
      to: this.toAddress,
      subject: input.subject,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px">
          <h2 style="color:#111;margin-bottom:8px">${input.title}</h2>
          <p style="color:#444;font-size:15px">${input.message}</p>
          <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
          <p style="color:#999;font-size:12px">Automated Book Generator — workflow notification</p>
        </div>`,
    });

    if (error) {
      this.logger.error(`Email send failed: ${JSON.stringify(error)}`);
    } else {
      this.logger.log(`Email sent successfully. ID: ${data?.id}`);
    }
  }
}


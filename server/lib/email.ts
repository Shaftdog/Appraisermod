import { ServerClient } from 'postmark';

if (!process.env.POSTMARK_SERVER_TOKEN) {
  console.warn('⚠️  POSTMARK_SERVER_TOKEN not set - email features disabled');
}

export const postmark = process.env.POSTMARK_SERVER_TOKEN
  ? new ServerClient(process.env.POSTMARK_SERVER_TOKEN)
  : null;

const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@appraisermod.com';

export async function sendWelcomeEmail(user: any, course: any) {
  if (!postmark) {
    console.log('[Email] Would send welcome email to:', user.email);
    return;
  }

  await postmark.sendEmail({
    From: FROM_EMAIL,
    To: user.email,
    Subject: `Welcome to ${course.title}!`,
    HtmlBody: `
      <html>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px; text-align: center;">
            <h1 style="color: white; margin: 0;">Welcome to ${course.title}!</h1>
          </div>

          <div style="padding: 40px; background: #f7fafc;">
            <p style="font-size: 16px; color: #2d3748; margin-bottom: 20px;">
              Hi ${user.fullName},
            </p>

            <p style="font-size: 16px; color: #2d3748; margin-bottom: 20px;">
              Thank you for enrolling in <strong>${course.title}</strong>! We're excited to have you on this learning journey.
            </p>

            <p style="font-size: 16px; color: #2d3748; margin-bottom: 30px;">
              You now have lifetime access to all course materials, including video lessons, downloadable resources, and community discussions.
            </p>

            <div style="text-align: center; margin: 40px 0;">
              <a href="${process.env.APP_ORIGIN}/courses/${course.slug}"
                 style="background: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                Start Learning Now
              </a>
            </div>

            <p style="font-size: 14px; color: #718096; margin-top: 40px;">
              Have questions? Reply to this email and we'll be happy to help!
            </p>

            <p style="font-size: 14px; color: #718096;">
              Happy learning!<br>
              The Appraiser Mod Team
            </p>
          </div>

          <div style="background: #2d3748; padding: 20px; text-align: center;">
            <p style="color: #a0aec0; font-size: 12px; margin: 0;">
              © ${new Date().getFullYear()} Appraiser Mod. All rights reserved.
            </p>
          </div>
        </body>
      </html>
    `,
    TextBody: `
      Hi ${user.fullName},

      Thank you for enrolling in ${course.title}! We're excited to have you on this learning journey.

      You now have lifetime access to all course materials, including video lessons, downloadable resources, and community discussions.

      Start learning now: ${process.env.APP_ORIGIN}/courses/${course.slug}

      Have questions? Reply to this email and we'll be happy to help!

      Happy learning!
      The Appraiser Mod Team
    `,
  });
}

export async function sendCourseCompletionEmail(user: any, course: any) {
  if (!postmark) {
    console.log('[Email] Would send completion email to:', user.email);
    return;
  }

  await postmark.sendEmail({
    From: FROM_EMAIL,
    To: user.email,
    Subject: `Congratulations! You've completed ${course.title}`,
    HtmlBody: `
      <html>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); padding: 40px; text-align: center;">
            <h1 style="color: white; margin: 0;">🎉 Congratulations!</h1>
          </div>

          <div style="padding: 40px; background: #f7fafc;">
            <p style="font-size: 16px; color: #2d3748; margin-bottom: 20px;">
              Hi ${user.fullName},
            </p>

            <p style="font-size: 16px; color: #2d3748; margin-bottom: 20px;">
              You've successfully completed <strong>${course.title}</strong>! This is a significant achievement and we're proud of your dedication.
            </p>

            <p style="font-size: 16px; color: #2d3748; margin-bottom: 30px;">
              Your certificate of completion is now available in your dashboard. You can download and share it with colleagues or add it to your professional portfolio.
            </p>

            <div style="text-align: center; margin: 40px 0;">
              <a href="${process.env.APP_ORIGIN}/dashboard"
                 style="background: #f5576c; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                View Certificate
              </a>
            </div>

            <p style="font-size: 14px; color: #718096; margin-top: 40px;">
              Keep the momentum going! Check out our other courses to continue expanding your skills.
            </p>

            <p style="font-size: 14px; color: #718096;">
              Congratulations again!<br>
              The Appraiser Mod Team
            </p>
          </div>

          <div style="background: #2d3748; padding: 20px; text-align: center;">
            <p style="color: #a0aec0; font-size: 12px; margin: 0;">
              © ${new Date().getFullYear()} Appraiser Mod. All rights reserved.
            </p>
          </div>
        </body>
      </html>
    `,
    TextBody: `
      Hi ${user.fullName},

      You've successfully completed ${course.title}! This is a significant achievement and we're proud of your dedication.

      Your certificate of completion is now available in your dashboard: ${process.env.APP_ORIGIN}/dashboard

      Keep the momentum going! Check out our other courses to continue expanding your skills.

      Congratulations again!
      The Appraiser Mod Team
    `,
  });
}

export async function sendWeeklyDigest(user: any, data: any) {
  if (!postmark) {
    console.log('[Email] Would send weekly digest to:', user.email);
    return;
  }

  const { newComments, leaderboard, continueWatching } = data;

  await postmark.sendEmail({
    From: FROM_EMAIL,
    To: user.email,
    Subject: 'Your Weekly Learning Summary',
    HtmlBody: `
      <html>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px; text-align: center;">
            <h1 style="color: white; margin: 0;">Your Weekly Summary</h1>
          </div>

          <div style="padding: 40px; background: #f7fafc;">
            <p style="font-size: 16px; color: #2d3748; margin-bottom: 30px;">
              Hi ${user.fullName},
            </p>

            ${continueWatching ? `
              <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 30px; border-left: 4px solid #667eea;">
                <h3 style="margin-top: 0; color: #2d3748;">Continue Watching</h3>
                <p style="color: #4a5568;">${continueWatching.courseTitle}</p>
                <p style="color: #718096; font-size: 14px;">Next up: ${continueWatching.nextLesson}</p>
              </div>
            ` : ''}

            ${newComments?.length > 0 ? `
              <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 30px;">
                <h3 style="margin-top: 0; color: #2d3748;">New Discussions</h3>
                ${newComments.slice(0, 3).map((comment: any) => `
                  <div style="padding: 10px 0; border-bottom: 1px solid #e2e8f0;">
                    <p style="color: #4a5568; margin: 5px 0;"><strong>${comment.user}</strong> commented:</p>
                    <p style="color: #718096; font-size: 14px; margin: 5px 0;">${comment.content.substring(0, 100)}...</p>
                  </div>
                `).join('')}
              </div>
            ` : ''}

            ${leaderboard?.length > 0 ? `
              <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 30px;">
                <h3 style="margin-top: 0; color: #2d3748;">🏆 This Week's Top Learners</h3>
                ${leaderboard.slice(0, 5).map((entry: any, idx: number) => `
                  <div style="padding: 10px 0; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between;">
                    <span style="color: #4a5568;">#${idx + 1} ${entry.name}</span>
                    <span style="color: #667eea; font-weight: bold;">${entry.points} pts</span>
                  </div>
                `).join('')}
              </div>
            ` : ''}

            <div style="text-align: center; margin: 40px 0;">
              <a href="${process.env.APP_ORIGIN}/dashboard"
                 style="background: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                Go to Dashboard
              </a>
            </div>

            <p style="font-size: 14px; color: #718096;">
              Keep up the great work!<br>
              The Appraiser Mod Team
            </p>
          </div>

          <div style="background: #2d3748; padding: 20px; text-align: center;">
            <p style="color: #a0aec0; font-size: 12px; margin: 0;">
              © ${new Date().getFullYear()} Appraiser Mod. All rights reserved.
            </p>
            <p style="color: #718096; font-size: 11px; margin: 10px 0 0 0;">
              <a href="#" style="color: #718096;">Unsubscribe</a>
            </p>
          </div>
        </body>
      </html>
    `,
  });
}

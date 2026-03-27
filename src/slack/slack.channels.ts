const isProduction = process.env.NODE_ENV === 'production';

export const SLACK_CHANNELS = {
  POST_CREATED: isProduction ? '#prod-post-created' : '#dev-post-created',
} as const;

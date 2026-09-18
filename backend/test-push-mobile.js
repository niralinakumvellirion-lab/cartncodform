require('dotenv').config();
const admin = require('firebase-admin');

const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!sa) {
  console.error('FIREBASE_SERVICE_ACCOUNT not set');
  process.exit(1);
}

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(sa)) });
}

const token = 'fFLpdaR0_aoimVXVwY6n9h:APA91bGxwgnAOL8xNGbA5W7Hb0V0hbT7ta8y5ZnuzxuQxm__Y7yzRZudDvrkgEv13MDmbYU71DVC6DAdX7qMwLSeXme36FPF7xGiphrl1IaloyzIGjbqqcw';

admin.messaging().send({
  token,
  data: {
    title: 'Test Mobile Push',
    body: 'Can you see this on mobile?',
    url: 'https://cartncod-form.myshopify.com',
    imageUrl: '',
    icon: ''
  },
  webpush: {
    headers: { Urgency: 'high' },
    notification: {
      title: 'Test Mobile Push',
      body: 'Can you see this on mobile?',
      requireInteraction: false
    },
    fcm_options: { link: 'https://cartncod-form.myshopify.com' }
  }
}).then(r => console.log('SUCCESS:', r))
  .catch(e => console.log('ERROR:', e.message, '| code:', e.code));

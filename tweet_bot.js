require('dotenv').config();
const puppeteer = require('puppeteer');
const axios = require('axios');

const KEYWORDS = [
  "startup", "entrepreneurship", "entrepreneur", "startup founder",
  "proof of work", "hackathon project", "student project", "hiring"
];

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

async function generateComment(tweetText) {
  const prompt = `
You are the official voice of Inovact Social, a social network for students and entrepreneurs to showcase projects and proof of work. 
The tweet says: "${tweetText}". 
Write a short, context-aware, authentic reply that subtly encourages them to check out Inovact Social. Keep it under 280 characters. 
CTA for students: Join Inovact at https://inovact.in
CTA for recruiters: Check Inovact Opportunities at https://inovact-opportunity.vercel.app/
`;

  const res = await axios.post(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
    {
      contents: [{ role: "user", parts: [{ text: prompt }] }]
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': GEMINI_API_KEY
      }
    }
  );

  return res.data.candidates[0].content.parts[0].text.trim();
}

async function runBot() {
  const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox']
});

  const page = await browser.newPage();

  await page.goto('https://twitter.com/login');
  await page.waitForSelector('input[name="text"]');

  await page.type('input[name="text"]', process.env.TWITTER_USERNAME);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2000);

  await page.type('input[name="password"]', process.env.TWITTER_PASSWORD);
  await page.keyboard.press('Enter');
  await page.waitForNavigation();

  for (const keyword of KEYWORDS) {
    await page.goto(`https://twitter.com/search?q=${encodeURIComponent(keyword)}%20lang%3Aen&src=typed_query&f=live`);
    await page.waitForSelector('article', { timeout: 10000 });

    const tweets = await page.$$('article');

    for (let i = 0; i < Math.min(tweets.length, 5); i++) {
      const tweet = tweets[i];

      const textHandle = await tweet.$('div[lang]');
      if (!textHandle) continue;

      const tweetText = await page.evaluate(el => el.innerText, textHandle);
      const reply = await generateComment(tweetText);

      const replyBtn = await tweet.$('div[data-testid="reply"]');
      if (!replyBtn) continue;

      await replyBtn.click();
      await page.waitForSelector('div[role="dialog"] div[contenteditable="true"]', { timeout: 5000 });
      await page.type('div[role="dialog"] div[contenteditable="true"]', reply);
      await page.click('div[role="dialog"] div[data-testid="tweetButton"]');

      await page.waitForTimeout(3000);
    }
  }

  await browser.close();
}

runBot();

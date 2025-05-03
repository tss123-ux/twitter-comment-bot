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

async function clickButtonByText(page, text) {
  const buttons = await page.$$eval('button', (buttons, text) => {
    return buttons.map(button => {
      return {
        element: button,
        text: button.innerText.trim(),
        visible: button.offsetParent !== null // Check if button is visible
      };
    }).filter(button => button.text.toLowerCase().includes(text.toLowerCase()) && button.visible);
  }, text);

  if (buttons.length > 0) {
    console.log(`Found ${buttons.length} buttons with text including "${text}":`);
    buttons.forEach((btn, index) => {
      console.log(`Button ${index + 1}: "${btn.text}"`);
    });

    // Click the first button that matches
    await page.evaluate(button => button.element.click(), buttons[0]);
    console.log(`Clicked button with text: ${text}`);
  } else {
    console.log(`No visible button found with text: "${text}"`);
  }
}

async function runBot() {
  const browser = await puppeteer.launch({
    headless: 'new', // Opt-in to new headless mode
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: null // Ensures you have full page view if needed
  });

  const page = await browser.newPage();

  try {
    console.log("Opening Twitter login page...");
    // Increased timeout for page navigation and better load handling
    await page.goto('https://twitter.com/login', {
      waitUntil: 'networkidle0', // Wait for the page to be idle
      timeout: 120000 // 2 minutes for navigation
    });
    await page.waitForSelector('input[name="text"]', { timeout: 10000 });

    console.log("Entering username...");
    await page.type('input[name="text"]', process.env.TWITTER_USERNAME);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);

    console.log("Looking for 'Next' button...");
    await clickButtonByText(page, 'Next');

    // If a security question is prompted, input the username
    await page.waitForSelector('input[name="username"]', { timeout: 10000 }).catch(async () => {
      console.log("No security prompt, proceeding to password...");
    });

    console.log("Entering password...");
    await page.type('input[name="password"]', process.env.TWITTER_PASSWORD);
    await page.keyboard.press('Enter');
    await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 120000 });

    console.log("Logged in, starting to search for keywords...");
    for (const keyword of KEYWORDS) {
      console.log(`Searching for tweets with keyword: ${keyword}`);
      await page.goto(`https://twitter.com/search?q=${encodeURIComponent(keyword)}%20lang%3Aen&src=typed_query&f=live`, {
        waitUntil: 'networkidle0',
        timeout: 120000
      });

      await page.waitForSelector('article', { timeout: 20000 });

      const tweets = await page.$$('article');

      if (tweets.length === 0) {
        console.log("No tweets found for the keyword.");
        continue;
      }

      for (let i = 0; i < Math.min(tweets.length, 5); i++) {
        const tweet = tweets[i];

        const textHandle = await tweet.$('div[lang]');
        if (!textHandle) {
          console.log("No tweet text found.");
          continue;
        }

        const tweetText = await page.evaluate(el => el.innerText, textHandle);
        console.log(`Tweet Text: ${tweetText}`);
        
        const reply = await generateComment(tweetText);
        console.log(`Generated Reply: ${reply}`);

        const replyBtn = await tweet.$('div[data-testid="reply"]');
        if (!replyBtn) {
          console.log("No reply button found.");
          continue;
        }

        await replyBtn.click();
        await page.waitForSelector('div[role="dialog"] div[contenteditable="true"]', { timeout: 5000 });
        await page.type('div[role="dialog"] div[contenteditable="true"]', reply);
        await page.click('div[role="dialog"] div[data-testid="tweetButton"]');

        console.log("Reply posted. Waiting for the next tweet...");
        
        // Get tweet URL and log where the reply was posted
        const tweetUrl = await page.evaluate(tweet => {
          const link = tweet.querySelector('a[href^="/status"]');
          return link ? `https://twitter.com${link.getAttribute('href')}` : null;
        }, tweet);
        
        console.log(`Reply posted on tweet: ${tweetUrl}`);
        
        await page.waitForTimeout(3000);
      }
    }
  } catch (error) {
    console.error("Error during bot execution:", error);
  } finally {
    await browser.close();
  }
}

runBot();

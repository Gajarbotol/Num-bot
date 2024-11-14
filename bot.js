const { Telegraf } = require('telegraf');
const fetch = require('node-fetch');
const { JSDOM } = require('jsdom');
const express = require('express');

// Configuration
const BOT_TOKEN = '8197408803:AAGiCs9p-BkgiK7gynahWhgVKpVGDldzF70'; // Replace with your actual bot token
const ADMIN_ID = '5197344486'; // Replace with your Telegram user ID

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

const bot = new Telegraf(BOT_TOKEN);
const users = new Set(); // Use a Set to store unique user IDs

// Start command
bot.start((ctx) => {
    const userId = ctx.from.id;
    users.add(userId); // Add user to the set

    const keyboard = userId == ADMIN_ID ? [
        [{ text: '🔍 Number Lookup' }],
        [{ text: '👥 View Users' }, { text: '📢 Broadcast' }]
    ] : [
        [{ text: '🔍 Number Lookup' }]
    ];

    ctx.reply(`Welcome! 😊 What would you like to do?`, {
        reply_markup: {
            keyboard: keyboard,
            resize_keyboard: true,
            one_time_keyboard: true
        }
    });
});

// Handle text messages
bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const text = ctx.message.text;

    if (text === '🔍 Number Lookup') {
        ctx.reply('Please enter the number you want to look up:');
    } else if (text === '👥 View Users' && userId == ADMIN_ID) {
        ctx.reply(`Users: ${Array.from(users).join(', ')}`);
    } else if (text === '📢 Broadcast' && userId == ADMIN_ID) {
        ctx.reply('Please enter your broadcast message:');
        bot.once('text', async (ctx) => {
            const broadcastMessage = ctx.message.text;
            users.forEach(userId => {
                if (userId != ADMIN_ID) {
                    bot.telegram.sendMessage(userId, `📢 Broadcast: ${broadcastMessage}`);
                }
            });
            ctx.reply('Broadcast sent!');
        });
    } else if (userId != ADMIN_ID && (text === '📢 Broadcast' || text === '👥 View Users')) {
        ctx.reply('You do not have permission to perform this action.');
    } else {
        if (/^[0-9]+$/.test(text)) {
            await ctx.replyWithChatAction('typing'); // Indicate typing action
            const result = await lookupNumber(text);
            ctx.reply(result, { parse_mode: 'Markdown' });
        } else {
            ctx.reply('Please enter a valid command or number.');
        }
    }
});

// Direct lookup function
async function lookupNumber(number) {
    const url = 'https://tools-hub.alien69is.my.id/tools/bl-loc-checker/';
    const headers = {
        'authority': 'tools-hub.alien69is.my.id',
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'accept-language': 'en-US,en;q=0.9,bn-US;q=0.8,bn;q=0.7',
        'cache-control': 'no-cache',
        'content-type': 'application/x-www-form-urlencoded',
        'origin': 'https://tools-hub.alien69is.my.id',
        'pragma': 'no-cache',
        'referer': 'https://tools-hub.alien69is.my.id/tools/bl-loc-checker/',
        'sec-ch-ua': '"Not-A.Brand";v="99", "Chromium";v="124"',
        'sec-ch-ua-mobile': '?1',
        'sec-ch-ua-platform': '"Android"',
        'sec-fetch-dest': 'document',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-site': 'same-origin',
        'sec-fetch-user': '?1',
        'upgrade-insecure-requests': '1',
        'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_7_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.31 Mobile/15E148 Safari/604.1'
    };

    const body = new URLSearchParams();
    body.append('msisdn', number);
    body.append('checkLocation', '');

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: body
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch data: ${response.statusText}`);
        }

        const html = await response.text();
        const dom = new JSDOM(html);
        const tbody = dom.window.document.querySelector('tbody');

        if (!tbody) {
            return 'No data found in response.';
        }

        const result = {};
        tbody.querySelectorAll('tr').forEach(row => {
            const th = row.querySelector('th')?.textContent.trim();
            const td = row.querySelector('td')?.textContent.trim();
            if (th && td) result[th] = td;
        });

        return formatResponse(result);
    } catch (error) {
        return `Error occurred: ${error.message}`;
    }
}

// Function to format the JSON response
function formatResponse(data) {
    return `
📞 *MSISDN*: ${data.Msisdn || 'N/A'}
🏠 *Address*: ${data.Address || 'N/A'}
🏢 *Thana*: ${data.Thana || 'N/A'}
🗺️ *District*: ${data.District || 'N/A'}
🔄 *Status*: ${data.Status || 'N/A'}
📡 *BTS Code*: ${data['BTS Code'] || 'N/A'}
`.trim();
}

// Express route to keep the bot alive
app.get('/health', (req, res) => {
    res.send('Bot is running!');
});

// Start Express server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

// Launch the bot
bot.launch();

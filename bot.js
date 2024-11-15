import { Telegraf } from 'telegraf';
import admin from 'firebase-admin';
import express from 'express';
import path from 'path';
import fetch from 'node-fetch';
import { JSDOM } from 'jsdom';

// Initialize Firebase Admin SDK
const serviceAccount = JSON.parse(await fs.promises.readFile(new URL('./serviceAccountKey.json', import.meta.url)));
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// Configuration
const BOT_TOKEN = '8197408803:AAGiCs9p-BkgiK7gynahWhgVKpVGDldzF70'; // Replace with your actual bot token
const ADMIN_ID = 5197344486; // Replace with your Telegram user ID
const CHANNELS = ['@gajarbotolx', '@gajarbotolxchat']; // Replace with your channel usernames
const PORT = process.env.PORT || 3000;

// Initialize Express app
const app = express();
const bot = new Telegraf(BOT_TOKEN);
const users = new Set(); // Use a Set to store unique user IDs

// Initialize user if not exists in Firestore
async function initializeUser(chatId) {
    const userRef = db.collection('users').doc(chatId.toString());
    const doc = await userRef.get();

    if (!doc.exists) {
        await userRef.set({
            points: 5,
            referrals: 0,
            isReferred: false,
            referredUsers: [],
            joinedChannels: false
        });
    }
}

// Check if the user has joined both channels
async function hasJoinedChannels(userId) {
    try {
        const results = await Promise.all(CHANNELS.map(channel =>
            bot.telegram.getChatMember(channel, userId)
        ));
        return results.every(result => ['member', 'administrator', 'creator'].includes(result.status));
    } catch (error) {
        console.error('Error checking channel membership:', error);
        return false;
    }
}

// Function to handle private chat messages only
function isPrivateChat(ctx) {
    return ctx.chat && ctx.chat.type === 'private';
}

// Start command
bot.start(async (ctx) => {
    if (!isPrivateChat(ctx)) return; // Ignore if not a private chat
    
    const userId = ctx.from.id;
    await initializeUser(userId);
    users.add(userId); // Add user to the set

    const keyboard = userId == ADMIN_ID ? [
        [{ text: '🔍 Number Lookup' }],
        [{ text: '💰 Balance' }, { text: '🏷️ Buy Points' }],
        [{ text: '👥 View Users' }, { text: '📢 Broadcast' }],
        [{ text: '🔗 Refer & Earn' }]
    ] : [
        [{ text: '🔍 Number Lookup' }],
        [{ text: '💰 Balance' }, { text: '🏷️ Buy Points' }],
        [{ text: '🔗 Refer & Earn' }]
    ];

    ctx.reply(`Welcome! 😊 What would you like to do?`, {
        reply_markup: {
            keyboard: keyboard,
            resize_keyboard: true,
            one_time_keyboard: true
        }
    });
});

// Handle /start with referral
bot.onText(/\/start(\s(\d+))?/, async (msg, match) => {
    if (msg.chat.type !== 'private') return; // Ignore if not a private chat

    const chatId = msg.chat.id;
    await initializeUser(chatId);

    const referrerId = match[2] ? parseInt(match[2]) : null;
    const userRef = db.collection('users').doc(chatId.toString());
    const userDoc = await userRef.get();
    const userData = userDoc.data();

    if (referrerId && referrerId !== chatId) {
        const referrerRef = db.collection('users').doc(referrerId.toString());
        const referrerDoc = await referrerRef.get();

        if (referrerDoc.exists && !userData.isReferred) {
            await referrerRef.update({
                points: admin.firestore.FieldValue.increment(2),
                referrals: admin.firestore.FieldValue.increment(1),
                referredUsers: admin.firestore.FieldValue.arrayUnion(chatId)
            });
            await userRef.update({ isReferred: true });

            bot.telegram.sendMessage(referrerId, "🎉 You've earned 2 points for referring a new user!");
        }
    }

    const inlineKeyboard = [
        [{ text: 'Join Channel One', url: `https://t.me/${CHANNELS[0].slice(1)}` }],
        [{ text: 'Join Channel Two', url: `https://t.me/${CHANNELS[1].slice(1)}` }],
        [{ text: '✅ Check Membership', callback_data: 'check_membership' }]
    ];

    bot.telegram.sendMessage(chatId, "Please join the following channels to start using the bot:", {
        reply_markup: { inline_keyboard: inlineKeyboard }
    }).then(sentMessage => {
        userRef.update({ joinMessageId: sentMessage.message_id });
    });
});

// Handle callback queries
bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    if (callbackQuery.message.chat.type !== 'private') return; // Ignore if not a private chat

    const data = callbackQuery.data;

    if (data === 'check_membership') {
        const joined = await hasJoinedChannels(chatId);
        const userRef = db.collection('users').doc(chatId.toString());
        const userDoc = await userRef.get();
        const userData = userDoc.data();

        if (joined) {
            // Delete the join message
            if (userData.joinMessageId) {
                bot.telegram.deleteMessage(chatId, userData.joinMessageId).catch(error => {
                    console.error('Error deleting message:', error);
                });
            }

            await userRef.update({ joinedChannels: true });

            bot.telegram.answerCallbackQuery(callbackQuery.id, { text: 'You have successfully joined both channels!' });
            bot.telegram.sendMessage(chatId, "Welcome! 😊 What would you like to do?", {
                reply_markup: {
                    keyboard: [
                        [{ text: '🔍 Number Lookup' }],
                        [{ text: '💰 Balance' }, { text: '🏷️ Buy Points' }],
                        [{ text: '🔗 Refer & Earn' }]
                    ],
                    resize_keyboard: true
                }
            });
        } else {
            bot.telegram.answerCallbackQuery(callbackQuery.id, { text: 'Please join both channels before proceeding.', show_alert: true });
        }
    }
});

// Handle text commands
bot.on('text', async (ctx) => {
    if (!isPrivateChat(ctx)) return; // Ignore if not a private chat
    
    const userId = ctx.from.id;
    const text = ctx.message.text;

    switch (text) {
        case '🔗 Refer & Earn':
            const referralLink = `https://t.me/NUM_LOOKUP_BYROBOT?start=${userId}`;
            const inlineKeyboard = [
                [{ text: '👥 My Referrals', callback_data: 'my_referrals' }],
                [{ text: '🏆 Top 10 Referrers', callback_data: 'leaderboard' }]
            ];
            ctx.reply(`Share this link to refer others and earn points:\n${referralLink}\nEach referral earns you 2 points!`, {
                reply_markup: { inline_keyboard: inlineKeyboard }
            });
            break;

        case '💰 Balance':
            db.collection('users').doc(userId.toString()).get().then(doc => {
                if (doc.exists) {
                    const user = doc.data();
                    ctx.reply(`Your current balance is ${user.points} points.\nReferrals: ${user.referrals}`);
                }
            });
            break;

        case '🔍 Number Lookup':
            db.collection('users').doc(userId.toString()).get().then(async doc => {
                if (doc.exists) {
                    const user = doc.data();
                    if (user.points > 0) {
                        await db.collection('users').doc(userId.toString()).update({ points: admin.firestore.FieldValue.increment(-1) });
                        ctx.reply('Please enter the number you want to look up.');
                    } else {
                        ctx.reply('You do not have enough points. Use "🏷️ Buy Points" to get more.');
                    }
                }
            });
            break;

        case '🏷️ Buy Points':
            ctx.reply('Please contact the admin to buy points.');
            break;

        case '👥 View Users':
            if (userId === ADMIN_ID) {
                db.collection('users').get().then(snapshot => {
                    let userList = '';
                    snapshot.forEach(doc => {
                        const data = doc.data();
                        userList += `${doc.id}: ${data.points} points, ${data.referrals} referrals, Referred: ${data.isReferred ? 'Yes' : 'No'}\n`;
                    });
                    ctx.reply(`Users:\n${userList}`);
                });
            }
            break;

        case '📢 Broadcast':
            if (userId === ADMIN_ID) {
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
            }
            break;

        default:
            if (/^[0-9]+$/.test(text)) {
                // Handle number lookup after user has entered a number
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

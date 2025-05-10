const express = require('express');
const { ethers } = require('ethers');
const axios = require('axios');
require('dotenv').config();

const app = express();
const provider = new ethers.providers.JsonRpcProvider('https://shy-polished-sound.monad-testnet.quiknode.pro/80816883909f333b81f1c58ff02c73e8bd5b70a1/');
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
const contract = new ethers.Contract(process.env.CONTRACT_ADDRESS, require('./Clickmonalypse.json').abi, wallet);

const notificationTokens = new Map();

app.use(express.json());

app.post('/webhook', async (req, res) => {
  try {
    const { event, notificationDetails, userId } = req.body;
    if (!event || !userId) {
      throw new Error('Invalid webhook event');
    }
    if (event === 'frame_added' && notificationDetails) {
      notificationTokens.set(userId, { token: notificationDetails.token, url: notificationDetails.url });
    } else if (event === 'notifications_enabled' && notificationDetails) {
      notificationTokens.set(userId, { token: notificationDetails.token, url: notificationDetails.url });
    } else if (event === 'frame_removed' || event === 'notifications_disabled') {
      notificationTokens.delete(userId);
    }
    res.status(200).send('Webhook received');
  } catch (error) {
    console.error('Error processing webhook:', error.message);
    res.status(400).send('Invalid webhook');
  }
});

const sendWarpcastNotification = async (userId, message, targetUrl) => {
  const details = notificationTokens.get(userId);
  if (!details) return;
  const { token, url } = details;
  try {
    const response = await axios.post(
      url,
      {
        notificationId: `clickmonalypse-${Date.now()}`,
        title: 'Clickmonalypse Update',
        body: message,
        targetUrl,
        tokens: [token],
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const { invalidTokens } = response.data;
    if (invalidTokens && invalidTokens.includes(token)) {
      notificationTokens.delete(userId);
    }
  } catch (error) {
    console.error('Error sending notification:', error.message);
  }
};

contract.on('TimerReset', async (clicker, newPot, timestamp) => {
  const message = `Timer reset by ${clicker}! Pot is now ${ethers.utils.formatEther(newPot)} MON.`;
  for (const userId of notificationTokens.keys()) {
    await sendWarpcastNotification(userId, message, 'https://yourdomain.com');
  }
});

contract.on('Winner', async (winner, pot, timestamp) => {
  const message = `Winner! ${winner} won ${ethers.utils.formatEther(pot)} MON! A new game has started.`;
  for (const userId of notificationTokens.keys()) {
    await sendWarpcastNotification(userId, message, 'https://yourdomain.com');
  }
});

setInterval(async () => {
  try {
    const tx = await contract.checkTimer({ gasLimit: 100000 });
    await tx.wait();
    console.log('checkTimer called successfully');
  } catch (error) {
    console.error('Error checking timer:', error.message);
  }
}, 5000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
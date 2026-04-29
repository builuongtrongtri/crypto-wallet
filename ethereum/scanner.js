require('dotenv').config();
const axios = require('axios');

const API = "https://api.etherscan.io/api";
const API_KEY = process.env.ETHERSCAN_API_KEY;

console.log("API Key:", API_KEY);

async function getTransactions(address) {
    const url = `${API}?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&sort=asc&apikey=${API_KEY}`;
    const res = await axios.get(url);
    return res.data.result;
}

module.exports = {
    getTransactions
};
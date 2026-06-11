require('dotenv').config();
const { ethers } = require('ethers');

const RPC_URL = process.env.RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
const provider = new ethers.JsonRpcProvider(RPC_URL);

module.exports = { provider };
#!/usr/bin/env node

const { io } = require('socket.io-client');
const readline = require('readline');
const chalk = require('chalk');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

let socket = null;
let currentUser = null;

function printHelp() {
  console.log('\nAvailable commands:');
  console.log('  auth <url> <token> - Connect and authenticate with WebSocket server');
  console.log('  disconnect - Disconnect from server');
  console.log('  ping - Send ping to server');
  console.log('  users - Get online users');
  console.log('  status - Show current connection status');
  console.log('  help - Show this help message');
  console.log('  exit - Exit the program\n');
}

function printStatus() {
  console.log('\n=== Connection Status ===');
  if (socket && socket.connected) {
    console.log(chalk.green('Connected: Yes'));
    console.log(chalk.green(`Socket ID: ${socket.id}`));
    if (currentUser) {
      console.log(chalk.green(`User ID: ${currentUser.userId}`));
      console.log(chalk.green(`Email: ${currentUser.email}`));
    }
  } else {
    console.log(chalk.red('Connected: No'));
  }
  console.log('=======================\n');
}

async function connect(url, token) {
  try {
    if (socket) {
      console.log(chalk.yellow('Already connected. Disconnecting first...'));
      await disconnect();
    }

    console.log(chalk.blue(`Connecting to ${url}...`));
    console.log(chalk.gray('Token:', token.substring(0, 20) + '...'));
    
    socket = io(url, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });

    socket.on('connect', () => {
      console.log(chalk.green('Socket connected! ID:'), socket.id);
      console.log(chalk.gray('Connection state:', socket.connected ? 'Connected' : 'Disconnected'));
      
      // Send authentication request
      console.log(chalk.blue('Sending authentication request...'));
      socket.emit('authenticate', { token });
    });

    socket.on('connect_error', (error) => {
      console.log(chalk.red('\n=== Connection Error ==='));
      console.log(chalk.red('Error message:', error.message));
      console.log(chalk.red('Error details:', error));
      console.log(chalk.red('=====================\n'));
    });

    socket.on('disconnect', (reason) => {
      console.log(chalk.yellow('Disconnected from server'));
      console.log(chalk.gray('Disconnect reason:', reason));
      currentUser = null;
    });

    socket.on('connected', (data) => {
      currentUser = data.user;
      console.log(chalk.green('\n=== Authentication Successful ==='));
      console.log(chalk.green(`Welcome, ${data.user.email}!`));
      console.log(chalk.green(`User ID: ${data.user.userId}`));
      console.log(chalk.green(`Socket ID: ${data.user.socketId}`));
      console.log(chalk.green('================================\n'));
    });

    socket.on('error', (error) => {
      console.log(chalk.red('\n=== Connection Error ==='));
      console.log(chalk.red('Error:', error));
      console.log(chalk.red('Error type:', typeof error));
      console.log(chalk.red('=====================\n'));
    });

    socket.on('user_status_update', (data) => {
      const timestamp = new Date().toLocaleTimeString();
      console.log(chalk.cyan(`[${timestamp}] User ${data.userId} is now ${data.status}`));
    });

    socket.on('online_users', (data) => {
      console.log(chalk.cyan('\n=== Online Users ==='));
      data.users.forEach(user => {
        console.log(chalk.cyan(`- ${user.userId} (${user.status})`));
      });
      console.log(chalk.cyan('==================\n'));
    });

    socket.on('pong', (data) => {
      console.log(chalk.green(`Pong received at ${new Date(data.timestamp).toLocaleTimeString()}`));
    });

  } catch (error) {
    console.log(chalk.red('\n=== Connection Error ==='));
    console.log(chalk.red('Error message:', error.message));
    console.log(chalk.red('Error stack:', error.stack));
    console.log(chalk.red('=====================\n'));
  }
}

async function disconnect() {
  if (socket) {
    console.log(chalk.gray('Disconnecting socket...'));
    socket.disconnect();
    socket = null;
    currentUser = null;
    console.log(chalk.yellow('Disconnected from server'));
  }
}

async function ping() {
  if (!socket || !socket.connected) {
    console.log(chalk.red('Not connected to server'));
    return;
  }
  console.log(chalk.gray('Sending ping...'));
  socket.emit('ping');
  console.log(chalk.blue('Ping sent...'));
}

async function getUsers() {
  if (!socket || !socket.connected) {
    console.log(chalk.red('Not connected to server'));
    return;
  }
  console.log(chalk.gray('Requesting online users...'));
  socket.emit('get_online_users');
}

async function handleCommand(input) {
  const [command, ...args] = input.trim().split(' ');

  switch (command.toLowerCase()) {
    case 'auth':
      if (args.length < 2) {
        console.log(chalk.red('Usage: auth <url> <token>'));
        return;
      }
      await connect(args[0], args[1]);
      break;

    case 'disconnect':
      await disconnect();
      break;

    case 'ping':
      await ping();
      break;

    case 'users':
      await getUsers();
      break;

    case 'status':
      printStatus();
      break;

    case 'help':
      printHelp();
      break;

    case 'exit':
      await disconnect();
      console.log(chalk.yellow('Goodbye!'));
      process.exit(0);
      break;

    default:
      console.log(chalk.red('Unknown command. Type "help" for available commands.'));
  }
}

console.log(chalk.blue('WebSocket CLI Client'));
console.log(chalk.blue('===================\n'));
printHelp();

rl.on('line', handleCommand); 
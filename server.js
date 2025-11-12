const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Game rooms storage
const gameRooms = new Map();

// Monopoly board properties
const BOARD_SPACES = [
  { id: 0, name: "GO", type: "go" },
  { id: 1, name: "Mediterranean Avenue", type: "property", color: "brown", price: 60, rent: [2, 10, 30, 90, 160, 250] },
  { id: 2, name: "Community Chest", type: "community" },
  { id: 3, name: "Baltic Avenue", type: "property", color: "brown", price: 60, rent: [4, 20, 60, 180, 320, 450] },
  { id: 4, name: "Income Tax", type: "tax", amount: 200 },
  { id: 5, name: "Reading Railroad", type: "railroad", price: 200, rent: [25, 50, 100, 200] },
  { id: 6, name: "Oriental Avenue", type: "property", color: "lightblue", price: 100, rent: [6, 30, 90, 270, 400, 550] },
  { id: 7, name: "Chance", type: "chance" },
  { id: 8, name: "Vermont Avenue", type: "property", color: "lightblue", price: 100, rent: [6, 30, 90, 270, 400, 550] },
  { id: 9, name: "Connecticut Avenue", type: "property", color: "lightblue", price: 120, rent: [8, 40, 100, 300, 450, 600] },
  { id: 10, name: "Jail / Just Visiting", type: "jail" },
  { id: 11, name: "St. Charles Place", type: "property", color: "pink", price: 140, rent: [10, 50, 150, 450, 625, 750] },
  { id: 12, name: "Electric Company", type: "utility", price: 150 },
  { id: 13, name: "States Avenue", type: "property", color: "pink", price: 140, rent: [10, 50, 150, 450, 625, 750] },
  { id: 14, name: "Virginia Avenue", type: "property", color: "pink", price: 160, rent: [12, 60, 180, 500, 700, 900] },
  { id: 15, name: "Pennsylvania Railroad", type: "railroad", price: 200, rent: [25, 50, 100, 200] },
  { id: 16, name: "St. James Place", type: "property", color: "orange", price: 180, rent: [14, 70, 200, 550, 750, 950] },
  { id: 17, name: "Community Chest", type: "community" },
  { id: 18, name: "Tennessee Avenue", type: "property", color: "orange", price: 180, rent: [14, 70, 200, 550, 750, 950] },
  { id: 19, name: "New York Avenue", type: "property", color: "orange", price: 200, rent: [16, 80, 220, 600, 800, 1000] },
  { id: 20, name: "Free Parking", type: "freeparking" },
  { id: 21, name: "Kentucky Avenue", type: "property", color: "red", price: 220, rent: [18, 90, 250, 700, 875, 1050] },
  { id: 22, name: "Chance", type: "chance" },
  { id: 23, name: "Indiana Avenue", type: "property", color: "red", price: 220, rent: [18, 90, 250, 700, 875, 1050] },
  { id: 24, name: "Illinois Avenue", type: "property", color: "red", price: 240, rent: [20, 100, 300, 750, 925, 1100] },
  { id: 25, name: "B&O Railroad", type: "railroad", price: 200, rent: [25, 50, 100, 200] },
  { id: 26, name: "Atlantic Avenue", type: "property", color: "yellow", price: 260, rent: [22, 110, 330, 800, 975, 1150] },
  { id: 27, name: "Ventnor Avenue", type: "property", color: "yellow", price: 260, rent: [22, 110, 330, 800, 975, 1150] },
  { id: 28, name: "Water Works", type: "utility", price: 150 },
  { id: 29, name: "Marvin Gardens", type: "property", color: "yellow", price: 280, rent: [24, 120, 360, 850, 1025, 1200] },
  { id: 30, name: "Go To Jail", type: "gotojail" },
  { id: 31, name: "Pacific Avenue", type: "property", color: "green", price: 300, rent: [26, 130, 390, 900, 1100, 1275] },
  { id: 32, name: "North Carolina Avenue", type: "property", color: "green", price: 300, rent: [26, 130, 390, 900, 1100, 1275] },
  { id: 33, name: "Community Chest", type: "community" },
  { id: 34, name: "Pennsylvania Avenue", type: "property", color: "green", price: 320, rent: [28, 150, 450, 1000, 1200, 1400] },
  { id: 35, name: "Short Line Railroad", type: "railroad", price: 200, rent: [25, 50, 100, 200] },
  { id: 36, name: "Chance", type: "chance" },
  { id: 37, name: "Park Place", type: "property", color: "darkblue", price: 350, rent: [35, 175, 500, 1100, 1300, 1500] },
  { id: 38, name: "Luxury Tax", type: "tax", amount: 100 },
  { id: 39, name: "Boardwalk", type: "property", color: "darkblue", price: 400, rent: [50, 200, 600, 1400, 1700, 2000] }
];

function createGameRoom(roomId, hostSocketId, hostName) {
  return {
    roomId,
    players: [{
      socketId: hostSocketId,
      name: hostName,
      position: 0,
      money: 1500,
      properties: [],
      inJail: false,
      jailTurns: 0,
      bankrupt: false
    }],
    currentPlayerIndex: 0,
    gameStarted: false,
    board: BOARD_SPACES,
    diceRoll: null,
    lastAction: null
  };
}

function rollDice() {
  return {
    dice1: Math.floor(Math.random() * 6) + 1,
    dice2: Math.floor(Math.random() * 6) + 1
  };
}

function calculateRent(property, owner, game) {
  if (property.type === 'property') {
    return property.rent[0];
  } else if (property.type === 'railroad') {
    const railroads = game.players[owner].properties.filter(p => 
      game.board.find(b => b.id === p && b.type === 'railroad')
    ).length;
    return property.rent[railroads - 1];
  } else if (property.type === 'utility') {
    const utilities = game.players[owner].properties.filter(p => 
      game.board.find(b => b.id === p && b.type === 'utility')
    ).length;
    const dice = game.diceRoll.dice1 + game.diceRoll.dice2;
    return utilities === 1 ? dice * 4 : dice * 10;
  }
  return 0;
}

io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  socket.on('createRoom', ({ playerName }) => {
    const roomId = uuidv4().substring(0, 6).toUpperCase();
    const game = createGameRoom(roomId, socket.id, playerName);
    gameRooms.set(roomId, game);
    socket.join(roomId);
    socket.emit('roomCreated', { roomId, game });
    
    // Send welcome message
    io.to(roomId).emit('systemMessage', { 
      text: `${playerName} created the room!` 
    });
    
    console.log(`Room ${roomId} created by ${playerName}`);
  });

  socket.on('joinRoom', ({ roomId, playerName }) => {
    const game = gameRooms.get(roomId);
    if (!game) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }
    if (game.gameStarted) {
      socket.emit('error', { message: 'Game already started' });
      return;
    }
    if (game.players.length >= 6) {
      socket.emit('error', { message: 'Room is full' });
      return;
    }

    game.players.push({
      socketId: socket.id,
      name: playerName,
      position: 0,
      money: 1500,
      properties: [],
      inJail: false,
      jailTurns: 0,
      bankrupt: false
    });

    socket.join(roomId);
    io.to(roomId).emit('gameUpdate', game);
    
    // Send join message to chat
    io.to(roomId).emit('systemMessage', { 
      text: `${playerName} joined the game!` 
    });
    
    console.log(`${playerName} joined room ${roomId}`);
  });

  socket.on('startGame', ({ roomId }) => {
    const game = gameRooms.get(roomId);
    if (!game) return;
    
    const player = game.players.find(p => p.socketId === socket.id);
    if (!player || game.players[0].socketId !== socket.id) {
      socket.emit('error', { message: 'Only host can start the game' });
      return;
    }

    game.gameStarted = true;
    game.currentPlayerIndex = 0;
    io.to(roomId).emit('gameStarted', game);
    
    // Send game start message
    io.to(roomId).emit('systemMessage', { 
      text: '🎮 Game started! Good luck everyone!' 
    });
  });

  socket.on('rollDice', ({ roomId }) => {
    const game = gameRooms.get(roomId);
    if (!game || !game.gameStarted) return;

    const currentPlayer = game.players[game.currentPlayerIndex];
    if (currentPlayer.socketId !== socket.id) {
      socket.emit('error', { message: 'Not your turn' });
      return;
    }

    if (currentPlayer.bankrupt) {
      socket.emit('error', { message: 'You are bankrupt' });
      return;
    }

    const dice = rollDice();
    game.diceRoll = dice;
    const total = dice.dice1 + dice.dice2;

    // Handle jail
    if (currentPlayer.inJail) {
      if (dice.dice1 === dice.dice2) {
        currentPlayer.inJail = false;
        currentPlayer.jailTurns = 0;
        currentPlayer.position = (currentPlayer.position + total) % 40;
      } else {
        currentPlayer.jailTurns++;
        if (currentPlayer.jailTurns >= 3) {
          currentPlayer.inJail = false;
          currentPlayer.jailTurns = 0;
          currentPlayer.money -= 50;
          currentPlayer.position = (currentPlayer.position + total) % 40;
        }
      }
    } else {
      // Move player
      const oldPosition = currentPlayer.position;
      currentPlayer.position = (currentPlayer.position + total) % 40;

      // Collect $200 for passing GO
      if (currentPlayer.position < oldPosition) {
        currentPlayer.money += 200;
        game.lastAction = `${currentPlayer.name} passed GO and collected $200`;
      }

      // Handle landing on spaces
      const space = game.board[currentPlayer.position];
      
      if (space.type === 'gotojail') {
        currentPlayer.position = 10;
        currentPlayer.inJail = true;
        game.lastAction = `${currentPlayer.name} went to jail`;
      } else if (space.type === 'property' || space.type === 'railroad' || space.type === 'utility') {
        const ownerIndex = game.players.findIndex(p => p.properties.includes(space.id));
        
        if (ownerIndex === -1) {
          game.lastAction = `${currentPlayer.name} landed on ${space.name} - Available for $${space.price}`;
        } else if (ownerIndex !== game.currentPlayerIndex) {
          const rent = calculateRent(space, ownerIndex, game);
          currentPlayer.money -= rent;
          game.players[ownerIndex].money += rent;
          game.lastAction = `${currentPlayer.name} paid $${rent} rent to ${game.players[ownerIndex].name}`;
          
          if (currentPlayer.money < 0) {
            currentPlayer.bankrupt = true;
            game.lastAction += ` - ${currentPlayer.name} is bankrupt!`;
          }
        }
      } else if (space.type === 'tax') {
        currentPlayer.money -= space.amount;
        game.lastAction = `${currentPlayer.name} paid $${space.amount} in taxes`;
      }
    }

    io.to(roomId).emit('diceRolled', { dice, game });
  });

  socket.on('buyProperty', ({ roomId }) => {
    const game = gameRooms.get(roomId);
    if (!game || !game.gameStarted) return;

    const currentPlayer = game.players[game.currentPlayerIndex];
    if (currentPlayer.socketId !== socket.id) return;

    const space = game.board[currentPlayer.position];
    if (!space.price) {
      socket.emit('error', { message: 'Cannot buy this space' });
      return;
    }

    const ownerIndex = game.players.findIndex(p => p.properties.includes(space.id));
    if (ownerIndex !== -1) {
      socket.emit('error', { message: 'Property already owned' });
      return;
    }

    if (currentPlayer.money < space.price) {
      socket.emit('error', { message: 'Not enough money' });
      return;
    }

    currentPlayer.money -= space.price;
    currentPlayer.properties.push(space.id);
    game.lastAction = `${currentPlayer.name} bought ${space.name} for $${space.price}`;

    io.to(roomId).emit('gameUpdate', game);
  });

  socket.on('endTurn', ({ roomId }) => {
    const game = gameRooms.get(roomId);
    if (!game || !game.gameStarted) return;

    const currentPlayer = game.players[game.currentPlayerIndex];
    if (currentPlayer.socketId !== socket.id) return;

    // Move to next player
    do {
      game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length;
    } while (game.players[game.currentPlayerIndex].bankrupt && 
             game.players.filter(p => !p.bankrupt).length > 1);

    game.diceRoll = null;

    // Check for game over
    const activePlayers = game.players.filter(p => !p.bankrupt);
    if (activePlayers.length === 1) {
      game.lastAction = `${activePlayers[0].name} wins the game!`;
      io.to(roomId).emit('gameOver', { winner: activePlayers[0] });
      io.to(roomId).emit('systemMessage', { 
        text: `🏆 ${activePlayers[0].name} wins the game!` 
      });
    }

    io.to(roomId).emit('gameUpdate', game);
  });

  // Chat functionality
  socket.on('sendChatMessage', ({ roomId, playerName, message }) => {
    const game = gameRooms.get(roomId);
    if (!game) return;

    const chatMessage = {
      playerName,
      message,
      timestamp: new Date().toISOString()
    };

    io.to(roomId).emit('chatMessage', chatMessage);
    console.log(`Chat in ${roomId} - ${playerName}: ${message}`);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    
    // Remove player from all rooms
    gameRooms.forEach((game, roomId) => {
      const playerIndex = game.players.findIndex(p => p.socketId === socket.id);
      if (playerIndex !== -1) {
        const player = game.players[playerIndex];
        game.players.splice(playerIndex, 1);
        
        if (game.players.length === 0) {
          gameRooms.delete(roomId);
        } else {
          if (game.currentPlayerIndex >= game.players.length) {
            game.currentPlayerIndex = 0;
          }
          io.to(roomId).emit('playerLeft', { playerName: player.name, game });
          io.to(roomId).emit('systemMessage', { 
            text: `${player.name} left the game` 
          });
        }
      }
    });
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

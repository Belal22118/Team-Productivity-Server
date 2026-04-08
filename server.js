const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;

// Room State Management
const rooms = new Map();

/**
 * Generate a random 6-character room code
 */
function generateRoomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    let currentRoomCode = null;
    let userName = null;

    // Heartbeat
    socket.on('ping', () => {
        socket.emit('pong');
    });

    // Create a new room
    socket.on('createRoom', (data) => {
        const code = generateRoomCode();
        const roomData = {
            code,
            creator: data.name,
            config: data.config,
            users: [{ id: socket.id, name: data.name }],
            tasks: [],
            timer: {
                timeLeft: data.config.focus * 60,
                initialTime: data.config.focus * 60,
                type: 'Focus',
                isPaused: true
            }
        };

        rooms.set(code, roomData);
        currentRoomCode = code;
        userName = data.name;
        
        socket.join(code);
        socket.emit('roomData', roomData);
        console.log(`Room created: ${code} by ${data.name}`);
    });

    // Join an existing room
    socket.on('joinRoom', (data) => {
        const room = rooms.get(data.code);
        if (room) {
            currentRoomCode = data.code;
            userName = data.name;
            
            // Avoid duplicate users if reconnecting
            if (!room.users.find(u => u.name === data.name)) {
                room.users.push({ id: socket.id, name: data.name });
            } else {
                // Update identity for existing user name
                room.users = room.users.map(u => u.name === data.name ? { id: socket.id, name: data.name } : u);
            }

            socket.join(data.code);
            socket.emit('roomData', room);
            
            // Sync current timer state to the new joiner
            socket.emit('timerSync', room.timer);
            
            // Notify others
            io.to(data.code).emit('roomData', room);
            console.log(`User ${data.name} joined room: ${data.code}`);
        } else {
            socket.emit('error', 'Room not found');
        }
    });

    // Task Updates
    socket.on('updateTasks', (tasks) => {
        const room = rooms.get(currentRoomCode);
        if (room) {
            room.tasks = tasks;
            socket.to(currentRoomCode).emit('taskUpdate', tasks);
        }
    });

    // Timer Synchronization (State Relay)
    socket.on('timerUpdate', (data) => {
        const room = rooms.get(currentRoomCode);
        if (room) {
            room.timer = { ...room.timer, ...data };
            socket.to(currentRoomCode).emit('timerSync', room.timer);
        }
    });

    // Timer Control (Pause/Resume/Reset)
    socket.on('timerControl', (data) => {
        const room = rooms.get(currentRoomCode);
        if (room) {
            room.timer = { ...room.timer, ...data };
            socket.to(currentRoomCode).emit('timerSync', room.timer);
        }
    });

    // End Session
    socket.on('endSession', () => {
        if (currentRoomCode) {
            io.to(currentRoomCode).emit('sessionEnded');
            rooms.delete(currentRoomCode);
            console.log(`Session ended for room: ${currentRoomCode}`);
        }
    });

    // Handle Disconnection
    socket.on('disconnect', () => {
        if (currentRoomCode) {
            const room = rooms.get(currentRoomCode);
            if (room) {
                room.users = room.users.filter(u => u.id !== socket.id);
                if (room.users.length === 0) {
                    // Optional: delay deletion to allow reconnection
                    rooms.delete(currentRoomCode);
                    console.log(`Room ${currentRoomCode} abandoned and deleted.`);
                } else {
                    io.to(currentRoomCode).emit('roomData', room);
                }
            }
        }
        console.log('User disconnected:', socket.id);
    });
});

server.listen(PORT, () => {
    console.log(`Team Productivity Server listening on port ${PORT}`);
});

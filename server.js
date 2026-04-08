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

// Health check
app.get('/', (req, res) => {
    res.send('OK');
});

// Room State Management
const rooms = new Map();

function generateRoomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    let currentRoomCode = null;
    let userName = null;

    socket.on('ping', () => {
        socket.emit('pong');
    });

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

    socket.on('joinRoom', (data) => {
        const room = rooms.get(data.code);
        if (room) {
            currentRoomCode = data.code;
            userName = data.name;
            
            if (!room.users.find(u => u.name === data.name)) {
                room.users.push({ id: socket.id, name: data.name });
            } else {
                room.users = room.users.map(u => u.name === data.name ? { id: socket.id, name: data.name } : u);
            }

            socket.join(data.code);
            socket.emit('roomData', room);
            socket.emit('timerSync', room.timer);
            io.to(data.code).emit('roomData', room);
            console.log(`User ${data.name} joined room: ${data.code}`);
        } else {
            socket.emit('joinError', 'Room not found');
        }
    });

    socket.on('updateTasks', (tasks) => {
        const room = rooms.get(currentRoomCode);
        if (room) {
            room.tasks = tasks;
            socket.to(currentRoomCode).emit('taskUpdate', tasks);
        }
    });

    socket.on('timerUpdate', (data) => {
        const room = rooms.get(currentRoomCode);
        if (room) {
            room.timer = { ...room.timer, ...data };
            socket.to(currentRoomCode).emit('timerSync', room.timer);
        }
    });

    socket.on('timerControl', (data) => {
        const room = rooms.get(currentRoomCode);
        if (room) {
            room.timer = { ...room.timer, ...data };
            socket.to(currentRoomCode).emit('timerSync', room.timer);
        }
    });

    socket.on('endSession', () => {
        if (currentRoomCode) {
            io.to(currentRoomCode).emit('sessionEnded');
            rooms.delete(currentRoomCode);
            console.log(`Session ended for room: ${currentRoomCode}`);
        }
    });

    socket.on('disconnect', () => {
        if (currentRoomCode) {
            const room = rooms.get(currentRoomCode);
            if (room) {
                room.users = room.users.filter(u => u.id !== socket.id);
                if (room.users.length === 0) {
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

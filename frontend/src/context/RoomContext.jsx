/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { socket } from '../socket';

const RoomContext = createContext();

export const useRoom = () => useContext(RoomContext);

export const RoomProvider = ({ children }) => {
    const [isConnected, setIsConnected] = useState(false);
    const [currentUser, setCurrentUser] = useState(null); // { id, nickname, role }
    const [users, setUsers] = useState([]); // List of all users in room
    const [messages, setMessages] = useState([]);
    const [roomId, setRoomId] = useState(null);

    // Initialize Socket connection
    useEffect(() => {
        function onConnect() {
            setIsConnected(true);
        }
        function onDisconnect() {
            setIsConnected(false);
            setCurrentUser(null);
        }
        function onRoomJoined({ user, existingUsers, chatHistory }) {
            setCurrentUser(user);
            setUsers(existingUsers);
            setMessages(chatHistory || []);
        }
        function onUserJoined(newUser) {
            setUsers(prev => [...prev, newUser]);
        }
        function onUserLeft(userId) {
            setUsers(prev => prev.filter(u => u.id !== userId));
        }
        function onReceiveMessage(message) {
            setMessages(prev => [...prev, message]);
        }

        socket.on('connect', onConnect);
        socket.on('disconnect', onDisconnect);
        socket.on('room_joined', onRoomJoined);
        socket.on('user_joined', onUserJoined);
        socket.on('user_left', onUserLeft);
        socket.on('receive_message', onReceiveMessage);

        return () => {
            socket.off('connect', onConnect);
            socket.off('disconnect', onDisconnect);
            socket.off('room_joined', onRoomJoined);
            socket.off('user_joined', onUserJoined);
            socket.off('user_left', onUserLeft);
            socket.off('receive_message', onReceiveMessage);
        };
    }, []);

    const joinRoom = useCallback((id, nickname) => {
        setRoomId(id);
        socket.connect();
        socket.emit('join_room', { roomId: id, nickname });
    }, []);

    const leaveRoom = useCallback(() => {
        socket.emit('leave_room', { roomId });
        socket.disconnect();
        setRoomId(null);
        setCurrentUser(null);
        setUsers([]);
        setMessages([]);
    }, [roomId]);

    const sendMessage = useCallback((text) => {
        if (!text.trim() || !currentUser) return;
        const msg = {
            id: Date.now() + Math.random().toString(),
            text,
            user: currentUser.nickname,
            role: currentUser.role,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        // Optimistic UI update
        setMessages(prev => [...prev, msg]);
        socket.emit('send_message', { roomId, message: msg });
    }, [roomId, currentUser]);

    return (
        <RoomContext.Provider value={{
            isConnected,
            currentUser,
            users,
            messages,
            roomId,
            joinRoom,
            leaveRoom,
            sendMessage
        }}>
            {children}
        </RoomContext.Provider>
    );
};

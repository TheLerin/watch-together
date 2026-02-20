/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { socket } from '../socket';

const RoomContext = createContext();

export const useRoom = () => useContext(RoomContext);

export const RoomProvider = ({ children }) => {
    const [isConnected, setIsConnected] = useState(false);
    const [currentUser, setCurrentUser] = useState(null); // { id, nickname, role }
    const [users, setUsers] = useState([]); // List of all users in room
    const [messages, setMessages] = useState([]);
    const [roomId, setRoomId] = useState(null);
    const isKicked = useRef(false);

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
        function onRoleUpdated({ userId, newRole }) {
            setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
            setCurrentUser(prev => prev?.id === userId ? { ...prev, role: newRole } : prev);
        }
        function onUserKicked() {
            isKicked.current = true;
            alert("You have been kicked from the room by the Host.");
            window.location.href = '/'; // Force redirect and cleanup
        }

        socket.on('connect', onConnect);
        socket.on('disconnect', onDisconnect);
        socket.on('room_joined', onRoomJoined);
        socket.on('user_joined', onUserJoined);
        socket.on('user_left', onUserLeft);
        socket.on('receive_message', onReceiveMessage);
        socket.on('role_updated', onRoleUpdated);
        socket.on('user_kicked', onUserKicked);

        return () => {
            socket.off('connect', onConnect);
            socket.off('disconnect', onDisconnect);
            socket.off('room_joined', onRoomJoined);
            socket.off('user_joined', onUserJoined);
            socket.off('user_left', onUserLeft);
            socket.off('receive_message', onReceiveMessage);
            socket.off('role_updated', onRoleUpdated);
            socket.off('user_kicked', onUserKicked);
        };
    }, []);

    const joinRoom = useCallback((id, nickname) => {
        setRoomId(id);
        socket.connect();
        socket.emit('join_room', { roomId: id, nickname });
    }, []);

    const leaveRoom = useCallback(() => {
        if (!isKicked.current) {
            socket.emit('leave_room', { roomId });
        }
        socket.disconnect();
        setRoomId(null);
        setCurrentUser(null);
        setUsers([]);
        setMessages([]);
        isKicked.current = false;
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

    // Role Management Helpers
    const promoteUser = useCallback((targetId) => {
        socket.emit('promote_to_moderator', { roomId, targetId });
    }, [roomId]);

    const demoteUser = useCallback((targetId) => {
        socket.emit('demote_to_viewer', { roomId, targetId });
    }, [roomId]);

    const transferHost = useCallback((targetId) => {
        socket.emit('transfer_host', { roomId, targetId });
    }, [roomId]);

    const kickUser = useCallback((targetId) => {
        socket.emit('kick_user', { roomId, targetId });
    }, [roomId]);

    return (
        <RoomContext.Provider value={{
            isConnected,
            currentUser,
            users,
            messages,
            roomId,
            joinRoom,
            leaveRoom,
            sendMessage,
            promoteUser,
            demoteUser,
            transferHost,
            kickUser
        }}>
            {children}
        </RoomContext.Provider>
    );
};

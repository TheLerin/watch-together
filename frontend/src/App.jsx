import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { RoomProvider } from './context/RoomContext';
import { ThemeProvider } from './context/ThemeContext';
import LandingPage from './components/LandingPage';
import RoomLayout from './components/RoomLayout';

function App() {
  return (
    <ThemeProvider>
      <RoomProvider>
        <Router>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/room/:roomId" element={<RoomLayout />} />
          </Routes>
        </Router>
      </RoomProvider>
    </ThemeProvider>
  );
}

export default App;

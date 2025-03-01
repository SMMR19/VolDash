import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import MenuBar from './components/MenuBar';
import VolatilityDashboard from './components/VolatilityDashboard';
import BidAskAnalysis from './components/BidAskAnalysis';
import Volatility3DModel from './components/Volatility3DModel';
import OptionPricingTool from './components/OptionPricingTool';

function App() {
  return (
    <Router>
      <div style={{ 
        backgroundColor: '#1a1a1a', // Full-screen background
        minHeight: '100vh', 
        width: '100%',
        display: 'flex',
        justifyContent: 'center' // Center the content
      }}>
        <div style={{
          maxWidth: '1400px', // Content width
          padding: '20px', 
          color: 'white',
          width: '100%',
          boxSizing: 'border-box'
        }}>
          <MenuBar />
          <Routes>
            <Route path="/" element={<VolatilityDashboard />} />
            <Route path="/bid-ask" element={<BidAskAnalysis />} />
            <Route path="/3d-volatility" element={<Volatility3DModel />} />
            <Route path="/option-pricing" element={<OptionPricingTool />} />
          </Routes>
        </div>
      </div>
    </Router>
  );
}

export default App;
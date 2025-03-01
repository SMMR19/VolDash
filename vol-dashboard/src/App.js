// vol-dashboard/src/app.js
import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import MenuBar from './components/MenuBar';
import VolatilityDashboard from './components/VolatilityDashboard';
import BidAskAnalysis from './components/BidAskAnalysis';
import Volatility3DModel from './components/Volatility3DModel';
import OptionPricing from './components/OptionPricing';  // Updated import
import PremiumChart from './components/PremiumChart';

function App() {
  return (
    <Router>
      <div style={{ backgroundColor: '#1a1a1a', minHeight: '100vh', width: '100%', display: 'flex', justifyContent: 'center' }}>
        <div style={{ maxWidth: '1400px', padding: '20px', color: 'white', width: '100%', boxSizing: 'border-box' }}>
          <MenuBar />
          <Routes>
            <Route path="/" element={<VolatilityDashboard />} />
            <Route path="/bid-ask" element={<BidAskAnalysis />} />
            <Route path="/3d-volatility" element={<Volatility3DModel />} />
            <Route path="/option-pricing" element={<OptionPricing />} />  {/* Updated route */}
            <Route path="/premium-chart" element={<PremiumChart />} />
          </Routes>
        </div>
      </div>
    </Router>
  );
}

export default App;
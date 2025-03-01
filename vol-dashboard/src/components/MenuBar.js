// vol-dashboard/src/components/MenuBar.js
import React from 'react';
import { Link } from 'react-router-dom';

function MenuBar() {
  return (
    <nav style={{ backgroundColor: '#333', padding: '8px', marginBottom: '15px' }}>
      <ul style={{ listStyle: 'none', display: 'flex', gap: '15px', margin: 0, padding: 0 }}>
        <li><Link to="/" style={{ color: 'white', textDecoration: 'none', fontSize: '16px' }}>Volatility Dashboard</Link></li>
        <li><Link to="/bid-ask" style={{ color: 'white', textDecoration: 'none', fontSize: '16px' }}>Bid-Ask Analysis</Link></li>
        <li><Link to="/3d-volatility" style={{ color: 'white', textDecoration: 'none', fontSize: '16px' }}>3D Volatility Model</Link></li>
        <li><Link to="/option-pricing" style={{ color: 'white', textDecoration: 'none', fontSize: '16px' }}>Option Pricing</Link></li> {/* Updated */}
        <li><Link to="/premium-chart" style={{ color: 'white', textDecoration: 'none', fontSize: '16px' }}>Premium Chart</Link></li>
      </ul>
    </nav>
  );
}

export default MenuBar;
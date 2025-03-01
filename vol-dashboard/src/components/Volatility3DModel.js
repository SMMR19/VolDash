import React, { useEffect, useState } from 'react';
import axios from 'axios';
import Plot from 'react-plotly.js';

function Volatility3DModel() {
  const [volSurfaceData, setVolSurfaceData] = useState({
    strikes: [],
    daysToExpiry: [],
    impliedVols: [],
    expiryDates: []
  });
  const [isLoading, setIsLoading] = useState(true);
  const [loadingError, setLoadingError] = useState(null);

  const fetchVolSurface = () => {
    setIsLoading(true);
    setLoadingError(null);
    axios.get('http://127.0.0.1:5000/volatility-surface/NIFTY/all', { timeout: 10000 })
      .then(response => {
        console.log("3D Volatility fetch successful. Data:", response.data);
        setVolSurfaceData({
          strikes: response.data.strikes || [],
          daysToExpiry: response.data.days_to_expiry || [],
          impliedVols: response.data.implied_vols || [],
          expiryDates: response.data.expiryDates || []
        });
        setIsLoading(false);
      })
      .catch(error => {
        console.error("3D Volatility fetch failed. Error:", error.message);
        setLoadingError(error.message);
        setIsLoading(false);
      });
  };

  useEffect(() => {
    fetchVolSurface();
  }, []);

  const handleRefresh = () => {
    fetchVolSurface();
  };

  const strikesUnique = [...new Set(volSurfaceData.strikes)];
  const daysUnique = [...new Set(volSurfaceData.daysToExpiry)];
  const zData = Array(daysUnique.length).fill().map(() => Array(strikesUnique.length).fill(0));
  
  volSurfaceData.strikes.forEach((strike, idx) => {
    const strikeIdx = strikesUnique.indexOf(strike);
    const dayIdx = daysUnique.indexOf(volSurfaceData.daysToExpiry[idx]);
    zData[dayIdx][strikeIdx] = volSurfaceData.impliedVols[idx];
  });

  const plotData = volSurfaceData.strikes.length > 0 ? [{
    x: strikesUnique,
    y: daysUnique,
    z: zData,
    type: 'surface',
    colorscale: 'Viridis',
    showscale: true,
    opacity: 0.8
  }] : [];

  const layout = {
    title: {
      text: '3D Volatility Surface - NIFTY (4 Closest Expiries)',
      font: { color: 'white', size: 16 } // Smaller title
    },
    scene: {
      xaxis: { title: 'Strike Price', titlefont: { color: 'white', size: 14 }, tickfont: { color: 'white', size: 12 } },
      yaxis: { title: 'Days to Expiry', titlefont: { color: 'white', size: 14 }, tickfont: { color: 'white', size: 12 } },
      zaxis: { title: 'Implied Volatility (%)', titlefont: { color: 'white', size: 14 }, tickfont: { color: 'white', size: 12 } }
    },
    paper_bgcolor: '#1a1a1a',
    plot_bgcolor: '#1a1a1a',
    width: 900, // Slightly smaller plot
    height: 500, // Reduced height
    margin: { l: 40, r: 40, b: 40, t: 40 } // Reduced margins
  };

  return (
    <div style={{ padding: '15px', maxWidth: '1400px', margin: '0 auto', backgroundColor: '#1a1a1a', color: 'white' }}>
      <h1 style={{ fontSize: '24px' }}>3D Volatility Model</h1>
      {isLoading ? (
        <p style={{ fontSize: '14px' }}>Loading 3D volatility surface...</p>
      ) : loadingError ? (
        <p style={{ color: 'red', fontSize: '14px' }}>Error: {loadingError}</p>
      ) : (
        <>
          <button 
            onClick={handleRefresh} 
            style={{ padding: '4px 8px', marginBottom: '15px', fontSize: '14px', backgroundColor: '#333', color: 'white', border: '1px solid white' }}
          >
            Refresh
          </button>
          <div style={{ marginBottom: '15px' }}>
            <p style={{ fontSize: '14px' }}>Expiries Plotted: {volSurfaceData.expiryDates.join(', ')}</p>
          </div>
          {plotData.length > 0 && volSurfaceData.impliedVols.some(iv => iv > 0) ? (
            <Plot
              data={plotData}
              layout={layout}
              config={{ responsive: true }}
            />
          ) : (
            <p style={{ fontSize: '14px' }}>No valid volatility data to plot. Check console for details.</p>
          )}
        </>
      )}
    </div>
  );
}

export default Volatility3DModel;
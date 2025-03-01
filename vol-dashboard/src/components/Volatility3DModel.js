// vol-dashboard/src/components/Volatility3DModel.js
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
  const [marketClosed, setMarketClosed] = useState(false);
  const symbol = 'NIFTY';

  const isMarketOpen = () => {
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istTime = new Date(now.getTime() + istOffset);
    const day = istTime.getUTCDay();
    const hours = istTime.getUTCHours();
    const minutes = istTime.getUTCMinutes();
    const timeInMinutes = hours * 60 + minutes;
    return day >= 1 && day <= 5 && timeInMinutes >= 555 && timeInMinutes <= 930;
  };

  const fetchVolSurface = () => {
    setIsLoading(true);
    setLoadingError(null);
    axios.get(`http://127.0.0.1:5000/volatility-surface/${symbol}/all`, { timeout: 10000 })
      .then(response => {
        if (response.data.error === "Market is closed") {
          setMarketClosed(true);
          const cachedData = JSON.parse(localStorage.getItem('volSurfaceData') || '{}');
          if (cachedData.strikes && cachedData.strikes.length > 0) {
            setVolSurfaceData(cachedData);
          }
        } else {
          const newData = {
            strikes: response.data.strikes || [],
            daysToExpiry: response.data.days_to_expiry || [],
            impliedVols: response.data.implied_vols || [],
            expiryDates: response.data.expiryDates || []
          };
          setVolSurfaceData(newData);
          localStorage.setItem('volSurfaceData', JSON.stringify(newData));
          setMarketClosed(false);
        }
        setIsLoading(false);
      })
      .catch(error => {
        setLoadingError(error.message);
        setIsLoading(false);
        const cachedData = JSON.parse(localStorage.getItem('volSurfaceData') || '{}');
        if (cachedData.strikes && cachedData.strikes.length > 0) {
          setVolSurfaceData(cachedData);
          setMarketClosed(true);
        }
      });
  };

  useEffect(() => {
    const cachedData = JSON.parse(localStorage.getItem('volSurfaceData') || '{}');
    if (cachedData.strikes && cachedData.strikes.length > 0) {
      setVolSurfaceData(cachedData);
      setMarketClosed(!isMarketOpen());
      setIsLoading(false);
    } else {
      fetchVolSurface();
    }
  }, []);

  const handleRefresh = () => {
    if (isMarketOpen()) {
      fetchVolSurface();
    } else {
      setMarketClosed(true);
    }
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
      text: `3D Volatility Surface - ${symbol} (4 Closest Expiries)${marketClosed ? ' [Market Closed - Last Data]' : ''}`,
      font: { color: 'white', size: 16 }
    },
    scene: {
      xaxis: { title: 'Strike Price', titlefont: { color: 'white', size: 14 }, tickfont: { color: 'white', size: 12 } },
      yaxis: { title: 'Days to Expiry', titlefont: { color: 'white', size: 14 }, tickfont: { color: 'white', size: 12 } },
      zaxis: { title: 'Implied Volatility (%)', titlefont: { color: 'white', size: 14 }, tickfont: { color: 'white', size: 12 } }
    },
    paper_bgcolor: '#1a1a1a',
    plot_bgcolor: '#1a1a1a',
    width: 900,
    height: 500,
    margin: { l: 40, r: 40, b: 40, t: 40 }
  };

  return (
    <div style={{ padding: '15px', maxWidth: '1400px', margin: '0 auto', backgroundColor: '#1a1a1a', color: 'white' }}>
      <h1 style={{ fontSize: '24px' }}>3D Volatility Model</h1>
      {isLoading ? (
        <p style={{ fontSize: '14px' }}>Loading 3D volatility surface...</p>
      ) : loadingError && volSurfaceData.strikes.length === 0 ? (
        <p style={{ color: 'red', fontSize: '14px' }}>Error: {loadingError}. No cached data available.</p>
      ) : (
        <>
          <button onClick={handleRefresh} style={{ padding: '4px 8px', marginBottom: '15px', fontSize: '14px', backgroundColor: '#333', color: 'white', border: '1px solid white' }}>
            Refresh
          </button>
          <div style={{ marginBottom: '15px' }}>
            <p style={{ fontSize: '14px' }}>Expiries Plotted: {volSurfaceData.expiryDates.join(', ')}</p>
          </div>
          {plotData.length > 0 && volSurfaceData.impliedVols.some(iv => iv > 0) ? (
            <Plot data={plotData} layout={layout} config={{ responsive: true }} />
          ) : (
            <p style={{ fontSize: '14px' }}>No valid volatility data to plot.</p>
          )}
        </>
      )}
    </div>
  );
}

export default Volatility3DModel;
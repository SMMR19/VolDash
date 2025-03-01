// vol-dashboard/src/components/PremiumChart.js
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, LineElement, PointElement, LinearScale, CategoryScale, Title, Tooltip, Legend } from 'chart.js';

ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, Title, Tooltip, Legend);

function PremiumChart() {
  const [premiumData, setPremiumData] = useState({ timestamps: [], premiums: [], ivs: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [loadingError, setLoadingError] = useState(null);
  const [isMarketOpen, setIsMarketOpen] = useState(false);
  const [symbol] = useState('NIFTY');
  const [expiryDates, setExpiryDates] = useState([]);
  const [strikes, setStrikes] = useState([]);
  const [selectedExpiry, setSelectedExpiry] = useState('27-Mar-2025');
  const [selectedStrike, setSelectedStrike] = useState(null);
  const [mode, setMode] = useState('straddle');
  const [chartType, setChartType] = useState('intraday');
  const [callWing, setCallWing] = useState(null);
  const [putWing, setPutWing] = useState(null);

  useEffect(() => {
    axios.get(`http://127.0.0.1:5000/volatility/${symbol}/default`, { timeout: 5000 })
      .then(response => {
        setExpiryDates(response.data.expiryDates || []);
        setStrikes(response.data.strikes || []);
        setSelectedExpiry(response.data.expiryDates.includes('27-Mar-2025') ? '27-Mar-2025' : response.data.expiryDates[0]);
        setSelectedStrike(response.data.atm_strike);
        setIsMarketOpen(!response.data.error); // Assume market closed if error present
      })
      .catch(error => {
        console.error('Volatility Fetch Error:', error.response ? error.response.data : error.message);
        setLoadingError(error.message);
        setIsMarketOpen(false);
      })
      .finally(() => {
        fetchPremiums();
      });
  }, [symbol]);

  const fetchPremiums = () => {
    if (!selectedExpiry || !selectedStrike) return;
    setIsLoading(true);
    let url = `http://127.0.0.1:5000/premiums/${symbol}/${selectedExpiry}/${selectedStrike}`;
    if (mode === 'ironfly' && callWing && putWing) {
      url += `/${callWing}/${putWing}`;
    }

    if (chartType === 'intraday') {
      axios.get(url, { timeout: 5000 })
        .then(response => {
          console.log('Intraday Premiums Response:', response.data);
          if (response.data.error) {
            fetchHistoricalDataAsFallback();
          } else {
            const { timestamp, straddle_premium, ironfly_premium, straddle_iv, ironfly_iv } = response.data;
            const timeStr = new Date(timestamp).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' });
            const today = new Date();
            const todayStart = new Date(today.setHours(0, 0, 0, 0)).getTime();
            if (timestamp >= todayStart) {
              setPremiumData(prev => ({
                timestamps: [...prev.timestamps, timeStr].slice(-20), // Keep last 20 points
                premiums: [...prev.premiums, mode === 'straddle' ? straddle_premium : ironfly_premium].slice(-20),
                ivs: [...prev.ivs, mode === 'straddle' ? straddle_iv : ironfly_iv].slice(-20)
              }));
            }
          }
          setIsLoading(false);
        })
        .catch(error => {
          console.error('Intraday Premiums Fetch Error:', error.response ? error.response.data : error.message);
          setLoadingError(error.message);
          fetchHistoricalDataAsFallback();
          setIsLoading(false);
        });
    } else { // Historical
      axios.get(`http://127.0.0.1:5000/premiums-history/${symbol}/${selectedExpiry}`, { timeout: 5000 })
        .then(response => {
          console.log('Historical Premiums Response:', response.data);
          const filteredData = mode === 'straddle'
            ? {
                timestamps: response.data.timestamps.map(ts => new Date(ts).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })),
                premiums: response.data.straddle_premiums,
                ivs: response.data.straddle_ivs
              }
            : {
                timestamps: response.data.timestamps.map(ts => new Date(ts).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })),
                premiums: response.data.ironfly_premiums,
                ivs: response.data.ironfly_ivs
              };
          setPremiumData(filteredData);
          setIsLoading(false);
        })
        .catch(error => {
          console.error('Historical Premiums Fetch Error:', error.response ? error.response.data : error.message);
          setLoadingError(error.message);
          setIsLoading(false);
        });
    }
  };

  const fetchHistoricalDataAsFallback = () => {
    axios.get(`http://127.0.0.1:5000/premiums-history/${symbol}/${selectedExpiry}`, { timeout: 5000 })
      .then(response => {
        console.log('Fallback Historical Response:', response.data);
        const filteredData = mode === 'straddle'
          ? {
              timestamps: response.data.timestamps.map(ts => new Date(ts).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })),
              premiums: response.data.straddle_premiums,
              ivs: response.data.straddle_ivs
            }
          : {
              timestamps: response.data.timestamps.map(ts => new Date(ts).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })),
              premiums: response.data.ironfly_premiums,
              ivs: response.data.ironfly_ivs
            };
        setPremiumData(filteredData);
      })
      .catch(error => {
        console.error('Fallback Historical Fetch Error:', error.response ? error.response.data : error.message);
        setPremiumData({ timestamps: [], premiums: [], ivs: [] });
      });
  };

  useEffect(() => {
    fetchPremiums();
    if (chartType === 'intraday' && isMarketOpen) {
      const interval = setInterval(fetchPremiums, 30000); // Fetch every 30 seconds
      return () => clearInterval(interval); // Cleanup on unmount or dependency change
    }
  }, [selectedExpiry, selectedStrike, mode, callWing, putWing, chartType, isMarketOpen]);

  const chartData = {
    labels: premiumData.timestamps,
    datasets: [
      {
        label: mode === 'straddle' ? 'Straddle Premium' : 'Iron Fly Premium',
        data: premiumData.premiums,
        borderColor: mode === 'straddle' ? 'blue' : 'green',
        backgroundColor: mode === 'straddle' ? 'rgba(0, 0, 255, 0.1)' : 'rgba(0, 255, 0, 0.1)',
        fill: false,
        yAxisID: 'y'
      },
      {
        label: mode === 'straddle' ? 'Straddle IV' : 'Iron Fly IV',
        data: premiumData.ivs,
        borderColor: 'purple',
        backgroundColor: 'rgba(128, 0, 128, 0.1)',
        fill: false,
        yAxisID: 'y1'
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top', labels: { color: 'white', font: { size: 14 } } },
      title: { 
        display: true, 
        text: `${chartType === 'intraday' ? 'Intraday' : 'Historical'} ${mode === 'straddle' ? 'Straddle' : 'Iron Fly'} Premiums & IV - ${symbol} (Expiry: ${selectedExpiry || 'Loading...'})${!isMarketOpen ? ' [Market Closed]' : ''}`,
        color: 'white', 
        font: { size: 16 } 
      }
    },
    scales: {
      x: { title: { display: true, text: 'Time (IST)', color: 'white', font: { size: 14 } }, ticks: { color: 'white', font: { size: 12 } } },
      y: { 
        title: { display: true, text: 'Premium (INR)', color: 'white', font: { size: 14 } }, 
        ticks: { color: 'white', font: { size: 12 } },
        position: 'left'
      },
      y1: { 
        title: { display: true, text: 'Implied Volatility (%)', color: 'white', font: { size: 14 } }, 
        ticks: { color: 'white', font: { size: 12 } },
        position: 'right',
        grid: { drawOnChartArea: false }
      }
    }
  };

  const handleModeChange = (newMode) => {
    setMode(newMode);
    setCallWing(null);
    setPutWing(null);
  };

  const handleChartTypeChange = (newType) => {
    setChartType(newType);
  };

  const handleExpiryChange = (e) => {
    setSelectedExpiry(e.target.value);
  };

  const handleStrikeChange = (e) => {
    setSelectedStrike(parseFloat(e.target.value));
  };

  const handleCallWingChange = (e) => {
    setCallWing(parseFloat(e.target.value));
  };

  const handlePutWingChange = (e) => {
    setPutWing(parseFloat(e.target.value));
  };

  return (
    <div style={{ padding: '15px', maxWidth: '1400px', margin: '0 auto', backgroundColor: '#1a1a1a', color: 'white' }}>
      <h1 style={{ fontSize: '24px' }}>Premium Chart</h1>
      {isLoading ? (
        <p style={{ fontSize: '14px' }}>Loading data...</p>
      ) : loadingError ? (
        <p style={{ color: 'red', fontSize: '14px' }}>Error: {loadingError}</p>
      ) : (
        <>
          <div style={{ marginBottom: '15px' }}>
            <label style={{ marginRight: '10px', fontSize: '14px' }}>Mode: </label>
            <button 
              onClick={() => handleModeChange('straddle')} 
              style={{ padding: '4px 8px', backgroundColor: mode === 'straddle' ? '#555' : '#333', color: 'white', border: '1px solid white', marginRight: '10px' }}
            >
              Straddle
            </button>
            <button 
              onClick={() => handleModeChange('ironfly')} 
              style={{ padding: '4px 8px', backgroundColor: mode === 'ironfly' ? '#555' : '#333', color: 'white', border: '1px solid white' }}
            >
              Iron Fly
            </button>
            <label style={{ marginRight: '10px', fontSize: '14px' }}>Chart Type: </label>
            <button 
              onClick={() => handleChartTypeChange('intraday')} 
              style={{ padding: '4px 8px', backgroundColor: chartType === 'intraday' ? '#555' : '#333', color: 'white', border: '1px solid white', marginRight: '10px' }}
            >
              Intraday
            </button>
            <button 
              onClick={() => handleChartTypeChange('historical')} 
              style={{ padding: '4px 8px', backgroundColor: chartType === 'historical' ? '#555' : '#333', color: 'white', border: '1px solid white' }}
            >
              Historical
            </button>
          </div>
          <div style={{ marginBottom: '15px' }}>
            <label htmlFor="expirySelect" style={{ marginRight: '10px', fontSize: '14px' }}>Select Expiry: </label>
            <select id="expirySelect" value={selectedExpiry || ''} onChange={handleExpiryChange} style={{ padding: '4px', fontSize: '14px', backgroundColor: '#333', color: 'white', border: '1px solid white', marginRight: '10px' }}>
              {expiryDates.map(date => <option key={date} value={date}>{date}</option>)}
            </select>
            <label htmlFor="strikeSelect" style={{ marginRight: '10px', fontSize: '14px' }}>{mode === 'straddle' ? 'Straddle Strike' : 'Sell Leg Strike'}: </label>
            <select id="strikeSelect" value={selectedStrike || ''} onChange={handleStrikeChange} style={{ padding: '4px', fontSize: '14px', backgroundColor: '#333', color: 'white', border: '1px solid white', marginRight: '10px' }}>
              {strikes.map(strike => <option key={strike} value={strike}>{strike}</option>)}
            </select>
            {mode === 'ironfly' && (
              <>
                <label htmlFor="callWing" style={{ marginRight: '10px', fontSize: '14px' }}>Buy Call Wing: </label>
                <select id="callWing" value={callWing || ''} onChange={handleCallWingChange} style={{ padding: '4px', fontSize: '14px', backgroundColor: '#333', color: 'white', border: '1px solid white', marginRight: '10px' }}>
                  <option value="">Select</option>
                  {strikes.map(strike => <option key={strike} value={strike}>{strike}</option>)}
                </select>
                <label htmlFor="putWing" style={{ marginRight: '10px', fontSize: '14px' }}>Buy Put Wing: </label>
                <select id="putWing" value={putWing || ''} onChange={handlePutWingChange} style={{ padding: '4px', fontSize: '14px', backgroundColor: '#333', color: 'white', border: '1px solid white' }}>
                  <option value="">Select</option>
                  {strikes.map(strike => <option key={strike} value={strike}>{strike}</option>)}
                </select>
              </>
            )}
          </div>
          {premiumData.timestamps.length > 0 ? (
            <div style={{ height: '400px', width: '100%' }}>
              <Line data={chartData} options={chartOptions} />
            </div>
          ) : (
            <p style={{ fontSize: '14px' }}>No premium data available yet for {chartType} view. Showing last available data if market is closed.</p>
          )}
        </>
      )}
    </div>
  );
}

export default PremiumChart;
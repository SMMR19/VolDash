// vol-dashboard/src/components/BidAskAnalysis.js
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, LineElement, PointElement, LinearScale, CategoryScale, Title, Tooltip, Legend } from 'chart.js';

ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, Title, Tooltip, Legend);

function BidAskAnalysis() {
  const [bidAskData, setBidAskData] = useState({
    times: [],
    ceSpreads: [],
    peSpreads: [],
    ceSpikes: [],
    peSpikes: []
  });
  const [isLoading, setIsLoading] = useState(true);
  const [loadingError, setLoadingError] = useState(null);
  const [symbol] = useState('NIFTY');
  const [expiryDates, setExpiryDates] = useState([]);
  const [strikes, setStrikes] = useState([]);
  const [selectedExpiry, setSelectedExpiry] = useState(null);
  const [selectedStrike, setSelectedStrike] = useState(null);
  const [marketClosed, setMarketClosed] = useState(false);

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

  useEffect(() => {
    axios.get(`http://127.0.0.1:5000/volatility/${symbol}/default`, { timeout: 5000 })
      .then(response => {
        if (response.data.error === "Market is closed") {
          setMarketClosed(true);
          const cachedConfig = JSON.parse(localStorage.getItem('bidAskConfig') || '{}');
          if (cachedConfig.expiryDates) {
            setExpiryDates(cachedConfig.expiryDates);
            setStrikes(cachedConfig.strikes);
            setSelectedExpiry(cachedConfig.selectedExpiry);
            setSelectedStrike(cachedConfig.selectedStrike);
          }
        } else {
          setExpiryDates(response.data.expiryDates || []);
          setStrikes(response.data.strikes || []);
          setSelectedExpiry(response.data.expiryDates[0]);
          setSelectedStrike(response.data.atm_strike);
          localStorage.setItem('bidAskConfig', JSON.stringify({
            expiryDates: response.data.expiryDates,
            strikes: response.data.strikes,
            selectedExpiry: response.data.expiryDates[0],
            selectedStrike: response.data.atm_strike
          }));
          setMarketClosed(false);
        }
        setIsLoading(false);
      })
      .catch(error => {
        setLoadingError(error.message);
        setIsLoading(false);
        const cachedConfig = JSON.parse(localStorage.getItem('bidAskConfig') || '{}');
        if (cachedConfig.expiryDates) {
          setExpiryDates(cachedConfig.expiryDates);
          setStrikes(cachedConfig.strikes);
          setSelectedExpiry(cachedConfig.selectedExpiry);
          setSelectedStrike(cachedConfig.selectedStrike);
          setMarketClosed(true);
        }
      });

    const cachedData = JSON.parse(localStorage.getItem('bidAskData') || '{}');
    if (cachedData.times && cachedData.times.length > 0) {
      setBidAskData(cachedData);
    }
  }, [symbol]);

  const fetchLiveBidAsk = () => {
    if (!selectedExpiry || !selectedStrike) return;
    if (!isMarketOpen()) {
      setMarketClosed(true);
      return;
    }
    axios.get(`http://127.0.0.1:5000/bid-ask/${symbol}/${selectedExpiry}/${selectedStrike}`, { timeout: 5000 })
      .then(response => {
        if (response.data.error === "Market is closed") {
          setMarketClosed(true);
        } else {
          const { timestamp, ce_spread, pe_spread, ce_spike, pe_spike } = response.data;
          setBidAskData(prev => {
            const newData = {
              times: [...prev.times, new Date(timestamp).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })].slice(-20),
              ceSpreads: [...prev.ceSpreads, ce_spread].slice(-20),
              peSpreads: [...prev.peSpreads, pe_spread].slice(-20),
              ceSpikes: [...prev.ceSpikes, ce_spike ? ce_spread : null].slice(-20),
              peSpikes: [...prev.peSpikes, pe_spike ? pe_spread : null].slice(-20)
            };
            localStorage.setItem('bidAskData', JSON.stringify(newData));
            return newData;
          });
          setMarketClosed(false);
        }
      })
      .catch(error => setLoadingError(error.message));
  };

  useEffect(() => {
    if (!selectedExpiry || !selectedStrike) return;
    if (isMarketOpen()) {
      fetchLiveBidAsk();
      const interval = setInterval(fetchLiveBidAsk, 5000);
      return () => clearInterval(interval);
    } else {
      setMarketClosed(true);
      const cachedData = JSON.parse(localStorage.getItem('bidAskData') || '{}');
      if (cachedData.times && cachedData.times.length > 0) {
        setBidAskData(cachedData);
      }
    }
  }, [selectedExpiry, selectedStrike]);

  const chartData = {
    labels: bidAskData.times,
    datasets: [
      { label: 'CE Spread', data: bidAskData.ceSpreads, borderColor: 'blue', backgroundColor: 'rgba(0, 0, 255, 0.1)', fill: false },
      { label: 'PE Spread', data: bidAskData.peSpreads, borderColor: 'red', backgroundColor: 'rgba(255, 0, 0, 0.1)', fill: false },
      { label: 'CE Spread Spikes', data: bidAskData.ceSpikes, borderColor: 'orange', backgroundColor: 'orange', pointRadius: bidAskData.ceSpikes.map(spike => spike ? 5 : 0), pointHoverRadius: 5, showLine: false },
      { label: 'PE Spread Spikes', data: bidAskData.peSpikes, borderColor: 'purple', backgroundColor: 'purple', pointRadius: bidAskData.peSpikes.map(spike => spike ? 5 : 0), pointHoverRadius: 5, showLine: false }
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top', labels: { color: 'white', font: { size: 14 } } },
      title: { 
        display: true, 
        text: `Bid/Ask Spread - ${symbol} (Expiry: ${selectedExpiry || 'Loading...'}, Strike: ${selectedStrike || 'Loading...'})${marketClosed ? ' [Market Closed - Last Data]' : ''}`,
        color: 'white',
        font: { size: 16 }
      },
      tooltip: {
        callbacks: {
          label: (context) => context.dataset.label.includes('Spikes') ? `${context.dataset.label} at ${context.raw}` : `${context.dataset.label}: ${context.raw}`
        }
      }
    },
    scales: {
      x: { title: { display: true, text: 'Time (IST)', color: 'white', font: { size: 14 } }, ticks: { color: 'white', font: { size: 12 } } },
      y: { title: { display: true, text: 'Spread (INR)', color: 'white', font: { size: 14 } }, ticks: { color: 'white', font: { size: 12 } } }
    }
  };

  const handleExpiryChange = (e) => {
    setSelectedExpiry(e.target.value);
    if (isMarketOpen()) fetchLiveBidAsk();
    else setMarketClosed(true);
  };
  const handleStrikeChange = (e) => {
    setSelectedStrike(e.target.value);
    if (isMarketOpen()) fetchLiveBidAsk();
    else setMarketClosed(true);
  };

  return (
    <div style={{ padding: '15px', maxWidth: '1400px', margin: '0 auto', backgroundColor: '#1a1a1a', color: 'white' }}>
      <h1 style={{ fontSize: '24px' }}>Bid/Ask Spread Analysis</h1>
      {isLoading ? (
        <p style={{ fontSize: '14px' }}>Loading data...</p>
      ) : loadingError && bidAskData.times.length === 0 ? (
        <p style={{ color: 'red', fontSize: '14px' }}>Error: {loadingError}. No cached data available.</p>
      ) : (
        <>
          <div style={{ marginBottom: '15px' }}>
            <label htmlFor="expirySelect" style={{ marginRight: '10px', fontSize: '14px' }}>Select Expiry: </label>
            <select id="expirySelect" value={selectedExpiry || ''} onChange={handleExpiryChange} style={{ padding: '4px', fontSize: '14px', backgroundColor: '#333', color: 'white', border: '1px solid white', marginRight: '10px' }}>
              {expiryDates.map((date) => <option key={date} value={date}>{date}</option>)}
            </select>
            <label htmlFor="strikeSelect" style={{ marginRight: '10px', fontSize: '14px' }}>Select Strike: </label>
            <select id="strikeSelect" value={selectedStrike || ''} onChange={handleStrikeChange} style={{ padding: '4px', fontSize: '14px', backgroundColor: '#333', color: 'white', border: '1px solid white' }}>
              {strikes.map((strike) => <option key={strike} value={strike}>{strike}</option>)}
            </select>
          </div>
          <div style={{ height: '300px', width: '100%', marginBottom: '20px' }}>
            {bidAskData.times.length > 0 ? (
              <Line data={chartData} options={chartOptions} />
            ) : (
              <p style={{ fontSize: '14px' }}>No data available.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default BidAskAnalysis;
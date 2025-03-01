import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Title,
  Tooltip,
  Legend
} from 'chart.js';

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

  useEffect(() => {
    axios.get(`http://127.0.0.1:5000/volatility/${symbol}/default`, { timeout: 5000 })
      .then(response => {
        console.log("Initial fetch successful. Data:", response.data);
        setExpiryDates(response.data.expiryDates || []);
        setStrikes(response.data.strikes || []);
        setSelectedExpiry(response.data.expiryDates[0]);
        setSelectedStrike(response.data.atm_strike);
        setIsLoading(false);
      })
      .catch(error => {
        console.error("Initial fetch failed. Error:", error.message);
        setLoadingError(error.message);
        setIsLoading(false);
      });
  }, [symbol]);

  const fetchLiveBidAsk = () => {
    if (!selectedExpiry || !selectedStrike) return;
    axios.get(`http://127.0.0.1:5000/bid-ask/${symbol}/${selectedExpiry}/${selectedStrike}`, { timeout: 5000 })
      .then(response => {
        console.log("Live bid-ask fetch successful. Data:", response.data);
        const { timestamp, ce_spread, pe_spread, ce_spike, pe_spike } = response.data;
        setBidAskData(prev => ({
          times: [...prev.times, new Date(timestamp).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })].slice(-20),
          ceSpreads: [...prev.ceSpreads, ce_spread].slice(-20),
          peSpreads: [...prev.peSpreads, pe_spread].slice(-20),
          ceSpikes: [...prev.ceSpikes, ce_spike ? ce_spread : null].slice(-20),
          peSpikes: [...prev.peSpikes, pe_spike ? pe_spread : null].slice(-20)
        }));
      })
      .catch(error => {
        console.error("Live bid-ask fetch failed. Error:", error.message);
        setLoadingError(error.message);
      });
  };

  useEffect(() => {
    if (!selectedExpiry || !selectedStrike) return;

    const isMarketOpen = () => {
      const now = new Date();
      const istOffset = 5.5 * 60 * 60 * 1000;
      const istTime = new Date(now.getTime() + istOffset);
      const day = istTime.getUTCDay();
      const hours = istTime.getUTCHours();
      const minutes = istTime.getUTCMinutes();
      const timeInMinutes = hours * 60 + minutes;

      const isWeekday = day >= 1 && day <= 5;
      const isWithinHours = timeInMinutes >= 555 && timeInMinutes <= 930;

      return isWeekday && isWithinHours;
    };

    fetchLiveBidAsk();
    const interval = setInterval(() => {
      if (isMarketOpen()) {
        fetchLiveBidAsk();
      } else {
        console.log("Market closed - skipping live bid-ask fetch");
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [selectedExpiry, selectedStrike]);

  const chartData = {
    labels: bidAskData.times,
    datasets: [
      {
        label: 'CE Spread',
        data: bidAskData.ceSpreads,
        borderColor: 'blue',
        backgroundColor: 'rgba(0, 0, 255, 0.1)',
        fill: false
      },
      {
        label: 'PE Spread',
        data: bidAskData.peSpreads,
        borderColor: 'red',
        backgroundColor: 'rgba(255, 0, 0, 0.1)',
        fill: false
      },
      {
        label: 'CE Spread Spikes',
        data: bidAskData.ceSpikes,
        borderColor: 'orange',
        backgroundColor: 'orange',
        pointRadius: bidAskData.ceSpikes.map(spike => spike ? 5 : 0),
        pointHoverRadius: 5,
        showLine: false
      },
      {
        label: 'PE Spread Spikes',
        data: bidAskData.peSpikes,
        borderColor: 'purple',
        backgroundColor: 'purple',
        pointRadius: bidAskData.peSpikes.map(spike => spike ? 5 : 0),
        pointHoverRadius: 5,
        showLine: false
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
        text: `Live Bid/Ask Spread - ${symbol} (Expiry: ${selectedExpiry || 'Loading...'}, Strike: ${selectedStrike || 'Loading...'})`,
        color: 'white',
        font: { size: 16 }
      },
      tooltip: {
        callbacks: {
          label: (context) => {
            if (context.dataset.label.includes('Spikes')) {
              return `${context.dataset.label} at ${context.raw}`;
            }
            return `${context.dataset.label}: ${context.raw}`;
          }
        }
      }
    },
    scales: {
      x: { title: { display: true, text: 'Time (IST)', color: 'white', font: { size: 14 } }, ticks: { color: 'white', font: { size: 12 } } },
      y: { title: { display: true, text: 'Spread (INR)', color: 'white', font: { size: 14 } }, ticks: { color: 'white', font: { size: 12 } } }
    }
  };

  const handleExpiryChange = (e) => setSelectedExpiry(e.target.value);
  const handleStrikeChange = (e) => setSelectedStrike(e.target.value);

  return (
    <div style={{ padding: '15px', maxWidth: '1400px', margin: '0 auto', backgroundColor: '#1a1a1a', color: 'white' }}>
      <h1 style={{ fontSize: '24px' }}>Bid/Ask Spread Analysis</h1>
      {isLoading ? (
        <p style={{ fontSize: '14px' }}>Loading data...</p>
      ) : loadingError ? (
        <p style={{ color: 'red', fontSize: '14px' }}>Error: {loadingError}</p>
      ) : (
        <>
          <div style={{ marginBottom: '15px' }}>
            <label htmlFor="expirySelect" style={{ marginRight: '10px', fontSize: '14px' }}>Select Expiry: </label>
            <select
              id="expirySelect"
              value={selectedExpiry || ''}
              onChange={handleExpiryChange}
              style={{ padding: '4px', fontSize: '14px', backgroundColor: '#333', color: 'white', border: '1px solid white', marginRight: '10px' }}
            >
              {expiryDates.map((date) => (
                <option key={date} value={date}>{date}</option>
              ))}
            </select>
            <label htmlFor="strikeSelect" style={{ marginRight: '10px', fontSize: '14px' }}>Select Strike: </label>
            <select
              id="strikeSelect"
              value={selectedStrike || ''}
              onChange={handleStrikeChange}
              style={{ padding: '4px', fontSize: '14px', backgroundColor: '#333', color: 'white', border: '1px solid white' }}
            >
              {strikes.map((strike) => (
                <option key={strike} value={strike}>{strike}</option>
              ))}
            </select>
          </div>
          <div style={{ height: '300px', width: '100%', marginBottom: '20px' }}>
            <Line data={chartData} options={chartOptions} />
          </div>
        </>
      )}
    </div>
  );
}

export default BidAskAnalysis;
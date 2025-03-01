// vol-dashboard/src/components/VolatilityDashboard.js
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, LineElement, PointElement, LinearScale, CategoryScale, Title, Tooltip, Legend, Filler } from 'chart.js';

ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, Title, Tooltip, Legend, Filler);

function VolatilityDashboard() {
  const [volData, setVolData] = useState({
    strikes: [],
    call_ivs: [],
    put_ivs: [],
    atm_strike: 0,
    underlying_value: 0,
    expiryDates: []
  });
  const [selectedExpiry, setSelectedExpiry] = useState(null);
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

  const fetchVolatilityData = () => {
    setIsLoading(true);
    setLoadingError(null);
    const url = selectedExpiry 
      ? `http://127.0.0.1:5000/volatility/${symbol}/${selectedExpiry}`
      : `http://127.0.0.1:5000/volatility/${symbol}/default`;
    axios.get(url, { timeout: 10000 })
      .then(response => {
        if (response.data.error === "Market is closed") {
          setMarketClosed(true);
          const cachedData = JSON.parse(localStorage.getItem('volData') || '{}');
          if (cachedData.strikes && cachedData.strikes.length > 0) {
            setVolData(cachedData);
            setSelectedExpiry(cachedData.expiryDates[0]);
          }
        } else {
          const newData = {
            strikes: response.data.strikes || [],
            call_ivs: response.data.call_ivs || [],
            put_ivs: response.data.put_ivs || [],
            atm_strike: response.data.atm_strike || 0,
            underlying_value: response.data.underlying_value || 0,
            expiryDates: response.data.expiryDates || []
          };
          setVolData(newData);
          localStorage.setItem('volData', JSON.stringify(newData));
          if (!selectedExpiry && newData.expiryDates.length > 0) {
            setSelectedExpiry(newData.expiryDates[0]);
          }
          setMarketClosed(false);
        }
        setIsLoading(false);
      })
      .catch(error => {
        console.error("Fetch failed. Error:", error.message);
        setLoadingError(error.message);
        setIsLoading(false);
        const cachedData = JSON.parse(localStorage.getItem('volData') || '{}');
        if (cachedData.strikes && cachedData.strikes.length > 0) {
          setVolData(cachedData);
          setSelectedExpiry(cachedData.expiryDates[0]);
          setMarketClosed(true);
        }
      });
  };

  useEffect(() => {
    const cachedData = JSON.parse(localStorage.getItem('volData') || '{}');
    if (cachedData.strikes && cachedData.strikes.length > 0) {
      setVolData(cachedData);
      setSelectedExpiry(cachedData.expiryDates[0]);
      setMarketClosed(!isMarketOpen());
      setIsLoading(false);
    } else {
      fetchVolatilityData();
    }
  }, [selectedExpiry]);

  const atmIndex = volData.strikes.indexOf(volData.atm_strike);
  const skewStartIndex = Math.max(0, atmIndex - 15);
  const skewEndIndex = Math.min(volData.strikes.length, atmIndex + 16);
  const skewStrikes = volData.strikes.slice(skewStartIndex, skewEndIndex);
  const skewCallIVs = volData.call_ivs.slice(skewStartIndex, skewEndIndex);
  const skewPutIVs = volData.put_ivs.slice(skewStartIndex, skewEndIndex);

  const skewChartData = {
    labels: skewStrikes,
    datasets: [
      { label: 'Call IV', data: skewCallIVs.map(iv => iv > 0 ? iv : null), borderColor: 'blue', backgroundColor: 'rgba(0, 0, 255, 0.1)', fill: false, spanGaps: true },
      { label: 'Put IV', data: skewPutIVs.map(iv => iv > 0 ? iv : null), borderColor: 'red', backgroundColor: 'rgba(255, 0, 0, 0.1)', fill: false, spanGaps: true }
    ]
  };

  const smileStartIndex = Math.max(0, atmIndex - 5);
  const smileEndIndex = Math.min(volData.strikes.length, atmIndex + 6);
  const smileStrikes = volData.strikes.slice(smileStartIndex, smileEndIndex);
  const smileCallIVs = volData.call_ivs.slice(smileStartIndex, smileEndIndex);
  const smilePutIVs = volData.put_ivs.slice(smileStartIndex, smileEndIndex);

  const smileChartData = {
    labels: smileStrikes,
    datasets: [
      {
        label: 'Implied Volatility',
        data: smileStrikes.map((strike, index) => {
          const call_iv = smileCallIVs[index];
          const put_iv = smilePutIVs[index];
          return strike < volData.atm_strike ? (put_iv > 0 ? put_iv : 0) : (call_iv > 0 ? call_iv : put_iv);
        }).filter(iv => iv > 0),
        borderColor: 'purple',
        backgroundColor: 'rgba(128, 0, 128, 0.1)',
        fill: false,
        spanGaps: true
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
        text: `Volatility Skew/Smile - ${symbol} ${selectedExpiry || ''}${marketClosed ? ' [Market Closed - Last Data]' : ''}`,
        color: 'white',
        font: { size: 16 }
      },
      annotation: {
        annotations: {
          atmLine: { type: 'line', xMin: volData.atm_strike, xMax: volData.atm_strike, borderColor: 'green', borderWidth: 2, label: { content: 'ATM', enabled: true, position: 'top', color: 'white', font: { size: 12 } } }
        }
      }
    },
    scales: {
      x: { title: { display: true, text: 'Strike Price', color: 'white', font: { size: 14 } }, ticks: { color: 'white', font: { size: 12 } } },
      y: { title: { display: true, text: 'Implied Volatility (%)', color: 'white', font: { size: 14 } }, ticks: { color: 'white', font: { size: 12 } } }
    }
  };

  const handleExpiryChange = (e) => {
    setSelectedExpiry(e.target.value);
    if (isMarketOpen()) {
      fetchVolatilityData();
    } else {
      setMarketClosed(true);
    }
  };

  return (
    <div style={{ padding: '15px', maxWidth: '1400px', margin: '0 auto', backgroundColor: '#1a1a1a', color: 'white' }}>
      <h1 style={{ fontSize: '24px' }}>Volatility Dashboard</h1>
      <p style={{ fontSize: '14px' }}>Underlying Value: {volData.underlying_value} | ATM Strike: {volData.atm_strike}</p>
      {isLoading ? (
        <p style={{ fontSize: '14px' }}>Loading data...</p>
      ) : loadingError && volData.strikes.length === 0 ? (
        <p style={{ color: 'red', fontSize: '14px' }}>Error: {loadingError}. No cached data available.</p>
      ) : (
        <>
          <div style={{ marginBottom: '15px' }}>
            <label htmlFor="expirySelect" style={{ marginRight: '10px', fontSize: '14px' }}>Select Expiry: </label>
            <select id="expirySelect" value={selectedExpiry || ''} onChange={handleExpiryChange} style={{ padding: '4px', fontSize: '14px', backgroundColor: '#333', color: 'white', border: '1px solid white' }}>
              {volData.expiryDates.map((date) => <option key={date} value={date}>{date}</option>)}
            </select>
          </div>
          <h2 style={{ fontSize: '20px' }}>Volatility Skew</h2>
          <div style={{ height: '300px', width: '100%', marginBottom: '30px' }}>
            {skewStrikes.length > 0 ? (
              <Line data={skewChartData} options={chartOptions} />
            ) : (
              <p style={{ fontSize: '14px' }}>No data available for Skew chart</p>
            )}
          </div>
          <h2 style={{ fontSize: '20px' }}>Volatility Smile</h2>
          <div style={{ height: '300px', width: '100%' }}>
            {smileStrikes.length > 0 ? (
              <Line data={smileChartData} options={chartOptions} />
            ) : (
              <p style={{ fontSize: '14px' }}>No data available for Smile chart</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default VolatilityDashboard;
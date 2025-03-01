import React, { useEffect, useState } from 'react';
import axios from 'axios';

function OptionPricingTool() {
  const [pricingData, setPricingData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingError, setLoadingError] = useState(null);
  const [symbol] = useState('NIFTY');
  const [expiryDates, setExpiryDates] = useState([]);
  const [strikes, setStrikes] = useState([]);
  const [selectedExpiry, setSelectedExpiry] = useState(null);
  const [selectedStrike, setSelectedStrike] = useState(null);
  const [model, setModel] = useState('BSM');
  const [hestonParams, setHestonParams] = useState({
    kappa: 2.0,
    theta: 0.04,
    sigma: 0.3,
    rho: -0.7,
    steps: 252,
    sims: 10000
  });
  const [vgParams, setVgParams] = useState({
    sigma: 0.2, // Volatility
    nu: 0.5,    // Variance of time (jump frequency)
    theta: -0.1 // Drift of jump size (negative for left skew)
  });
  const [underlyingPrice, setUnderlyingPrice] = useState(null);
  const [manualUnderlyingPrice, setManualUnderlyingPrice] = useState('');
  const [useManualPrice, setUseManualPrice] = useState(false);

  // BSM Normal CDF
  const norm_cdf = (x) => {
    const t = 1 / (1 + 0.2316419 * Math.abs(x));
    const d = 0.3989423 * Math.exp(-x * x / 2);
    let prob = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
    return x > 0 ? 1 - prob : prob;
  };

  // BSM Pricing
  const bsm_price = (S, K, T, r, sigma, option_type) => {
    const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);
    if (option_type === 'call') {
      return S * norm_cdf(d1) - K * Math.exp(-r * T) * norm_cdf(d2);
    } else {
      return K * Math.exp(-r * T) * norm_cdf(-d2) - S * norm_cdf(-d1);
    }
  };

  // Heston Monte Carlo
  const heston_price = (S, K, T, r, v0, kappa, theta, sigma, rho, steps, sims) => {
    const dt = T / steps;
    let ce_total = 0, pe_total = 0;

    for (let sim = 0; sim < sims; sim++) {
      let St = S;
      let vt = v0;

      for (let t = 0; t < steps; t++) {
        const z1 = gaussianRandom();
        const z2 = gaussianRandom();
        const correlated_z = rho * z1 + Math.sqrt(1 - rho * rho) * z2;

        vt = Math.max(vt + kappa * (theta - vt) * dt + sigma * Math.sqrt(vt) * Math.sqrt(dt) * z1, 0);
        St *= Math.exp((r - 0.5 * vt) * dt + Math.sqrt(vt) * Math.sqrt(dt) * correlated_z);
      }

      ce_total += Math.max(St - K, 0);
      pe_total += Math.max(K - St, 0);
    }

    const discount = Math.exp(-r * T);
    return {
      ce_price: (ce_total / sims) * discount,
      pe_price: (pe_total / sims) * discount
    };
  };

  // Variance Gamma Pricing (Monte Carlo Simulation for simplicity)
  const vg_price = (S, K, T, r, sigma, nu, theta, option_type) => {
    const nSims = 10000; // Number of simulations
    let ce_total = 0, pe_total = 0;

    for (let i = 0; i < nSims; i++) {
      // Simulate Gamma time change
      const gammaTime = gammaRandom(T / nu, nu); // Gamma-distributed time
      const drift = r + (1 / nu) * Math.log(1 - theta * nu - 0.5 * sigma * sigma * nu); // Risk-neutral drift
      const z = gaussianRandom();
      const increment = theta * gammaTime + sigma * Math.sqrt(gammaTime) * z;
      const St = S * Math.exp(drift * T + increment);

      ce_total += Math.max(St - K, 0);
      pe_total += Math.max(K - St, 0);
    }

    const discount = Math.exp(-r * T);
    return option_type === 'call' 
      ? (ce_total / nSims) * discount 
      : (pe_total / nSims) * discount;
  };

  // Gaussian Random Number Generator
  const gaussianRandom = () => {
    const u1 = Math.random();
    const u2 = Math.random();
    return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  };

  // Gamma Random Number Generator (Simplified using Marsaglia’s method)
  const gammaRandom = (shape, scale) => {
    let v = 1;
    for (let i = 0; i < shape; i++) {
      v *= Math.random();
    }
    return -Math.log(v) * scale;
  };

  useEffect(() => {
    axios.get(`http://127.0.0.1:5000/volatility/${symbol}/default`, { timeout: 5000 })
      .then(response => {
        console.log("Initial fetch successful. Data:", response.data);
        setExpiryDates(response.data.expiryDates || []);
        setStrikes(response.data.strikes || []);
        setSelectedExpiry(response.data.expiryDates[0]);
        setSelectedStrike(response.data.atm_strike);
        setUnderlyingPrice(response.data.underlying_value);
        setIsLoading(false);
      })
      .catch(error => {
        console.error("Initial fetch failed. Error:", error.message);
        setLoadingError(error.message);
        setIsLoading(false);
      });
  }, [symbol]);

  useEffect(() => {
    if (useManualPrice) return;

    const fetchUnderlyingPrice = () => {
      axios.get(`http://127.0.0.1:5000/underlying-price/NIFTY%2050`, { timeout: 5000 })
        .then(response => {
          console.log("Underlying price fetch successful. Data:", response.data);
          setUnderlyingPrice(response.data.underlying_value);
        })
        .catch(error => {
          console.error("Underlying price fetch failed. Error:", error.message);
        });
    };

    fetchUnderlyingPrice();
    const interval = setInterval(fetchUnderlyingPrice, 5000);
    return () => clearInterval(interval);
  }, [useManualPrice]);

  const fetchPricing = () => {
    if (!selectedExpiry || !selectedStrike) return;
    setIsLoading(true);

    axios.get(`http://127.0.0.1:5000/option-price/${symbol}/${selectedExpiry}/${selectedStrike}`, { timeout: 5000 })
      .then(response => {
        console.log("Option pricing fetch successful. Data:", response.data);
        const data = response.data;
        const S = useManualPrice && manualUnderlyingPrice ? parseFloat(manualUnderlyingPrice) : underlyingPrice;

        if (model === 'BSM') {
          const cePrice = bsm_price(S, data.strike, data.time_to_expiry, data.risk_free_rate, data.ce_iv / 100, 'call');
          const pePrice = bsm_price(S, data.strike, data.time_to_expiry, data.risk_free_rate, data.pe_iv / 100, 'put');
          setPricingData({
            ...data,
            ce_price: cePrice.toFixed(2),
            pe_price: pePrice.toFixed(2),
            underlying_value: S
          });
        } else if (model === 'Heston') {
          const v0 = (Math.max(data.ce_iv, data.pe_iv) / 100) ** 2;
          const { kappa, theta, sigma, rho, steps, sims } = hestonParams;
          const hestonPrices = heston_price(S, data.strike, data.time_to_expiry, data.risk_free_rate, v0, kappa, theta, sigma, rho, steps, sims);
          setPricingData({
            ...data,
            ce_price: hestonPrices.ce_price.toFixed(2),
            pe_price: hestonPrices.pe_price.toFixed(2),
            underlying_value: S,
            kappa,
            theta,
            sigma,
            rho,
            steps,
            sims
          });
        } else if (model === 'VarianceGamma') {
          const { sigma, nu, theta } = vgParams;
          const cePrice = vg_price(S, data.strike, data.time_to_expiry, data.risk_free_rate, sigma, nu, theta, 'call');
          const pePrice = vg_price(S, data.strike, data.time_to_expiry, data.risk_free_rate, sigma, nu, theta, 'put');
          setPricingData({
            ...data,
            ce_price: cePrice.toFixed(2),
            pe_price: pePrice.toFixed(2),
            underlying_value: S,
            sigma,
            nu,
            theta
          });
        }
        setIsLoading(false);
      })
      .catch(error => {
        console.error("Option pricing fetch failed. Error:", error.message);
        setLoadingError(error.message);
        setIsLoading(false);
      });
  };

  const handleExpiryChange = (e) => setSelectedExpiry(e.target.value);
  const handleStrikeChange = (e) => setSelectedStrike(e.target.value);
  const handleModelChange = (e) => setModel(e.target.value);
  const handleCalculate = () => fetchPricing();
  const handleManualPriceChange = (e) => setManualUnderlyingPrice(e.target.value);
  const handleToggleManualPrice = () => setUseManualPrice(!useManualPrice);

  const handleHestonParamChange = (param) => (e) => {
    setHestonParams(prev => ({
      ...prev,
      [param]: parseFloat(e.target.value)
    }));
  };

  const handleVgParamChange = (param) => (e) => {
    setVgParams(prev => ({
      ...prev,
      [param]: parseFloat(e.target.value)
    }));
  };

  return (
    <div style={{ padding: '15px', maxWidth: '1400px', margin: '0 auto', backgroundColor: '#1a1a1a', color: 'white' }}>
      <h1 style={{ fontSize: '24px' }}>Option Pricing Discovery Tool</h1>
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
              style={{ padding: '4px', fontSize: '14px', backgroundColor: '#333', color: 'white', border: '1px solid white', marginRight: '10px' }}
            >
              {strikes.map((strike) => (
                <option key={strike} value={strike}>{strike}</option>
              ))}
            </select>
            <label htmlFor="modelSelect" style={{ marginRight: '10px', fontSize: '14px' }}>Select Model: </label>
            <select
              id="modelSelect"
              value={model}
              onChange={handleModelChange}
              style={{ padding: '4px', fontSize: '14px', backgroundColor: '#333', color: 'white', border: '1px solid white', marginRight: '10px' }}
            >
              <option value="BSM">Black-Scholes-Merton</option>
              <option value="Heston">Heston</option>
              <option value="VarianceGamma">Variance Gamma</option>
            </select>
            <label style={{ marginRight: '10px', fontSize: '14px' }}>Underlying Price: </label>
            {useManualPrice ? (
              <input
                type="number"
                value={manualUnderlyingPrice}
                onChange={handleManualPriceChange}
                placeholder="Enter manually"
                style={{ padding: '4px', fontSize: '14px', width: '80px', backgroundColor: '#333', color: 'white', border: '1px solid white', marginRight: '10px' }}
              />
            ) : (
              <span style={{ marginRight: '10px', fontSize: '14px' }}>{underlyingPrice || 'Loading...'}</span>
            )}
            <button 
              onClick={handleToggleManualPrice}
              style={{ padding: '4px 8px', fontSize: '14px', backgroundColor: '#333', color: 'white', border: '1px solid white', marginRight: '10px' }}
            >
              {useManualPrice ? 'Use Auto' : 'Use Manual'}
            </button>
            <button 
              onClick={handleCalculate} 
              style={{ padding: '4px 8px', fontSize: '14px', backgroundColor: '#333', color: 'white', border: '1px solid white' }}
            >
              Calculate
            </button>
          </div>
          {model === 'Heston' && (
            <div style={{ marginBottom: '15px' }}>
              <h3 style={{ fontSize: '20px' }}>Heston Parameters</h3>
              <label style={{ marginRight: '10px', fontSize: '14px' }}>Kappa: </label>
              <input
                type="number"
                value={hestonParams.kappa}
                onChange={handleHestonParamChange('kappa')}
                step="0.1"
                style={{ width: '50px', marginRight: '10px', backgroundColor: '#333', color: 'white', border: '1px solid white', fontSize: '14px' }}
              />
              <label style={{ marginRight: '10px', fontSize: '14px' }}>Theta: </label>
              <input
                type="number"
                value={hestonParams.theta}
                onChange={handleHestonParamChange('theta')}
                step="0.01"
                style={{ width: '50px', marginRight: '10px', backgroundColor: '#333', color: 'white', border: '1px solid white', fontSize: '14px' }}
              />
              <label style={{ marginRight: '10px', fontSize: '14px' }}>Sigma: </label>
              <input
                type="number"
                value={hestonParams.sigma}
                onChange={handleHestonParamChange('sigma')}
                step="0.1"
                style={{ width: '50px', marginRight: '10px', backgroundColor: '#333', color: 'white', border: '1px solid white', fontSize: '14px' }}
              />
              <label style={{ marginRight: '10px', fontSize: '14px' }}>Rho: </label>
              <input
                type="number"
                value={hestonParams.rho}
                onChange={handleHestonParamChange('rho')}
                step="0.1"
                min="-1"
                max="1"
                style={{ width: '50px', marginRight: '10px', backgroundColor: '#333', color: 'white', border: '1px solid white', fontSize: '14px' }}
              />
              <label style={{ marginRight: '10px', fontSize: '14px' }}>Steps: </label>
              <input
                type="number"
                value={hestonParams.steps}
                onChange={handleHestonParamChange('steps')}
                step="10"
                style={{ width: '50px', marginRight: '10px', backgroundColor: '#333', color: 'white', border: '1px solid white', fontSize: '14px' }}
              />
              <label style={{ marginRight: '10px', fontSize: '14px' }}>Sims: </label>
              <input
                type="number"
                value={hestonParams.sims}
                onChange={handleHestonParamChange('sims')}
                step="1000"
                style={{ width: '70px', backgroundColor: '#333', color: 'white', border: '1px solid white', fontSize: '14px' }}
              />
            </div>
          )}
          {model === 'VarianceGamma' && (
            <div style={{ marginBottom: '15px' }}>
              <h3 style={{ fontSize: '20px' }}>Variance Gamma Parameters</h3>
              <label style={{ marginRight: '10px', fontSize: '14px' }}>Sigma: </label>
              <input
                type="number"
                value={vgParams.sigma}
                onChange={handleVgParamChange('sigma')}
                step="0.01"
                style={{ width: '50px', marginRight: '10px', backgroundColor: '#333', color: 'white', border: '1px solid white', fontSize: '14px' }}
              />
              <label style={{ marginRight: '10px', fontSize: '14px' }}>Nu: </label>
              <input
                type="number"
                value={vgParams.nu}
                onChange={handleVgParamChange('nu')}
                step="0.1"
                style={{ width: '50px', marginRight: '10px', backgroundColor: '#333', color: 'white', border: '1px solid white', fontSize: '14px' }}
              />
              <label style={{ marginRight: '10px', fontSize: '14px' }}>Theta: </label>
              <input
                type="number"
                value={vgParams.theta}
                onChange={handleVgParamChange('theta')}
                step="0.01"
                style={{ width: '50px', marginRight: '10px', backgroundColor: '#333', color: 'white', border: '1px solid white', fontSize: '14px' }}
              />
            </div>
          )}
          {pricingData && (
            <div>
              <h2 style={{ fontSize: '20px' }}>Results ({model})</h2>
              <p style={{ fontSize: '14px' }}>Underlying Price: {pricingData.underlying_value}</p>
              <p style={{ fontSize: '14px' }}>Strike Price: {pricingData.strike}</p>
              <p style={{ fontSize: '14px' }}>Time to Expiry: {pricingData.time_to_expiry.toFixed(4)} years</p>
              <p style={{ fontSize: '14px' }}>Risk-Free Rate: {(pricingData.risk_free_rate * 100).toFixed(2)}%</p>
              {model === 'Heston' && (
                <>
                  <p style={{ fontSize: '14px' }}>Heston Parameters:</p>
                  <p style={{ fontSize: '14px' }}>- Kappa: {pricingData.kappa}</p>
                  <p style={{ fontSize: '14px' }}>- Theta: {pricingData.theta.toFixed(4)}</p>
                  <p style={{ fontSize: '14px' }}>- Sigma: {pricingData.sigma}</p>
                  <p style={{ fontSize: '14px' }}>- Rho: {pricingData.rho}</p>
                  <p style={{ fontSize: '14px' }}>- Steps: {pricingData.steps}</p>
                  <p style={{ fontSize: '14px' }}>- Simulations: {pricingData.sims}</p>
                </>
              )}
              {model === 'VarianceGamma' && (
                <>
                  <p style={{ fontSize: '14px' }}>Variance Gamma Parameters:</p>
                  <p style={{ fontSize: '14px' }}>- Sigma: {pricingData.sigma}</p>
                  <p style={{ fontSize: '14px' }}>- Nu: {pricingData.nu}</p>
                  <p style={{ fontSize: '14px' }}>- Theta: {pricingData.theta}</p>
                </>
              )}
              <h3 style={{ fontSize: '18px' }}>Call Option (CE)</h3>
              <p style={{ fontSize: '14px' }}>Implied Volatility: {pricingData.ce_iv.toFixed(2)}%</p>
              <p style={{ fontSize: '14px' }}>Theoretical Price: ₹{pricingData.ce_price}</p>
              <p style={{ fontSize: '14px' }}>Market Price: ₹{pricingData.ce_market_price}</p>
              <h3 style={{ fontSize: '18px' }}>Put Option (PE)</h3>
              <p style={{ fontSize: '14px' }}>Implied Volatility: {pricingData.pe_iv.toFixed(2)}%</p>
              <p style={{ fontSize: '14px' }}>Theoretical Price: ₹{pricingData.pe_price}</p>
              <p style={{ fontSize: '14px' }}>Market Price: ₹{pricingData.pe_market_price}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default OptionPricingTool;
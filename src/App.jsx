import React, { useState, useEffect } from 'react';
import { Settings, Battery, Zap, DollarSign, Box, Activity, AlertTriangle, CheckCircle, TrendingUp, Sliders, Monitor } from 'lucide-react';

export default function App() {
  // --- STATE: UI Navigation ---
  const [activeTab, setActiveTab] = useState('dashboard');

  // --- STATE: Input Parameters (Strictly EV Traffic & High-Level Constraints) ---
  const [inputs, setInputs] = useState({
    carsPerDay: 30,
    energyPerCar: 54, // kWh
    peakWindowHours: 8,
    peakTrafficPercent: 70, // %
    numPorts: 4,
    powerPerPort: 180, // kW
    fcPower: 100, // kW
    electricityPrice: 0.99, // SAR
    lpgPrice: 1.09, // SAR
  });

  // --- STATE: System Constants & Hardware Limits ---
  const [constants, setConstants] = useState({
    fcEfficiency: 0.60,
    fcMinZVS: 0.30, // 30% minimum continuous load for Fuel Cell health
    batteryDoD: 0.80,
    batteryRTE: 0.90,
    lpgLHV: 6.78, // kWh/L
    cRateLimit: 0.97, // DCR Constraint
    containerArea: 28.3, // m2 (40ft internal)
    usdToSar: 3.75,
    costs: {
      fcPerKW: 2500, // USD
      batteryPerKWh: 300, // USD
      chargerPerPort: 28500, // USD
      bopFixed: 100000, // USD
      installContingency: 1.30 // 30% markup (1 + 0.3)
    },
    footprint: {
      batteryPerKWh: 0.02, // m2 per kWh
      fcPerKW: 0.05, // m2 per kW
      pcsPerKW: 0.01, // m2 per kW
      hvacFixed: 4.0 // m2
    },
    ancillary: {
      baseAuxPower: 10, // kW (Base HVAC/BOP)
      adScreensQty: 2, // Number of outdoor screens
      adScreenPowerKW: 1.5, // kW per screen
      adScreenCostUSD: 5000, // Hardware cost per screen
      adRevenuePerScreenSAR: 5000 // Monthly revenue per screen
    }
  });

  // --- STATE: Computed Results ---
  const [results, setResults] = useState({
    batteryCapacity: 0,
    pcsPower: 0,
    totalAuxPower: 0,
    maxSiteLoad: 0,
    cRate: 0,
    totalCapexSAR: 0,
    dailyProfit: 0,
    annualProfit: 0,
    paybackYears: 0,
    footprintArea: 0,
    footprintPercent: 0,
    warnings: []
  });

  // --- CALCULATION ENGINE ---
  useEffect(() => {
    let warningsList = [];

    // 0. Calculate total auxiliary load (Base + Ads)
    const totalAuxPower = constants.ancillary.baseAuxPower + (constants.ancillary.adScreensQty * constants.ancillary.adScreenPowerKW);

    // 1. Energy Dynamics
    const dailyEVDemand = inputs.carsPerDay * inputs.energyPerCar;
    const dailyAuxDemand = totalAuxPower * 24;
    const totalDailyEnergy = dailyEVDemand + dailyAuxDemand;

    const peakCars = inputs.carsPerDay * (inputs.peakTrafficPercent / 100);
    const peakEVDemand = peakCars * inputs.energyPerCar;
    const peakAuxDemand = totalAuxPower * inputs.peakWindowHours;
    const peakTotalDemand = peakEVDemand + peakAuxDemand;
    
    const fcPeakSupply = inputs.fcPower * inputs.peakWindowHours;
    const peakDeficit = Math.max(0, peakTotalDemand - fcPeakSupply);

    // 2. Power Dynamics (C-Rate Check)
    const maxSiteLoad = (inputs.numPorts * inputs.powerPerPort) + totalAuxPower;
    const pcsRequiredPower = Math.max(0, maxSiteLoad - inputs.fcPower);
    
    // 3. Battery Sizing (Max of Energy need vs Power need)
    const rawEnergyBatterySize = peakDeficit / (constants.batteryDoD * constants.batteryRTE);
    const powerConstrainedBatterySize = pcsRequiredPower / constants.cRateLimit; 
    
    let finalBatterySize = Math.max(rawEnergyBatterySize, powerConstrainedBatterySize);
    
    // Round battery to nearest 5 kWh
    finalBatterySize = Math.ceil(finalBatterySize / 5) * 5;

    // Safeguard to prevent division by zero or NaN
    const actualCRate = finalBatterySize > 0 ? pcsRequiredPower / finalBatterySize : 0;

    // Check FC Minimum limits (Idle night check)
    if (inputs.fcPower * constants.fcMinZVS > totalAuxPower) {
      warningsList.push(`Night Idle Risk: FC min ZVS is ${Math.round(inputs.fcPower * constants.fcMinZVS)}kW, but night Aux load is only ${totalAuxPower}kW. A braking chopper or dump load is needed.`);
    }

    if (totalDailyEnergy > (inputs.fcPower * 24)) {
      warningsList.push("FC capacity is too small to cover 24-hour total energy demand. Battery will deplete over multiple days.");
    }

    // 4. Financials
    const dailyFuelEnergy = totalDailyEnergy / constants.fcEfficiency;
    const dailyLpgLiters = dailyFuelEnergy / constants.lpgLHV;
    const dailyFuelCost = dailyLpgLiters * inputs.lpgPrice;
    
    const dailyRevenue = dailyEVDemand * inputs.electricityPrice;
    const dailyProfit = dailyRevenue - dailyFuelCost;
    
    const totalAdRevenueMonthly = constants.ancillary.adScreensQty * constants.ancillary.adRevenuePerScreenSAR;
    const annualProfit = (dailyProfit * 365) + (totalAdRevenueMonthly * 12);

    const capexHardware = (inputs.fcPower * constants.costs.fcPerKW) + 
                          (finalBatterySize * constants.costs.batteryPerKWh) + 
                          (inputs.numPorts * constants.costs.chargerPerPort) + 
                          (constants.ancillary.adScreensQty * constants.ancillary.adScreenCostUSD) +
                          constants.costs.bopFixed;
    
    const totalCapexUSD = capexHardware * constants.costs.installContingency;
    const totalCapexSAR = totalCapexUSD * constants.usdToSar;
    
    const paybackYears = annualProfit > 0 ? totalCapexSAR / annualProfit : 999;

    // 5. Container Spatial Planning
    const batteryArea = finalBatterySize * constants.footprint.batteryPerKWh;
    const fcArea = inputs.fcPower * constants.footprint.fcPerKW;
    const pcsArea = pcsRequiredPower * constants.footprint.pcsPerKW;
    const totalArea = batteryArea + fcArea + pcsArea + constants.footprint.hvacFixed;
    const areaPercent = (totalArea / constants.containerArea) * 100;

    if (areaPercent > 90) {
      warningsList.push("Container Footprint Exceeded! System is too large for a standard 40ft layout.");
    }

    setResults({
      batteryCapacity: finalBatterySize,
      pcsPower: pcsRequiredPower,
      totalAuxPower: totalAuxPower,
      maxSiteLoad: maxSiteLoad,
      cRate: actualCRate,
      totalCapexSAR: totalCapexSAR,
      dailyProfit: dailyProfit,
      annualProfit: annualProfit,
      paybackYears: paybackYears,
      footprintArea: totalArea,
      footprintPercent: areaPercent,
      warnings: warningsList
    });

  }, [inputs, constants]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setInputs(prev => ({
      ...prev,
      [name]: parseFloat(value) || 0
    }));
  };

  const handleConstantChange = (category, field, value) => {
    const numValue = parseFloat(value) || 0;
    setConstants(prev => {
      if (category) {
        return {
          ...prev,
          [category]: {
            ...prev[category],
            [field]: numValue
          }
        };
      }
      return {
        ...prev,
        [field]: numValue
      };
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6 font-sans text-slate-800">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* HEADER & TABS */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                <Zap className="text-blue-600" /> H2EV Sizing & Optimization Engine
              </h1>
              <p className="text-slate-500 mt-1">Configure inputs and constants to dynamically calculate microgrid architecture.</p>
            </div>
            
            <div className="flex bg-slate-100 p-1 rounded-lg">
              <button 
                onClick={() => setActiveTab('dashboard')}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-md transition-colors ${activeTab === 'dashboard' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <Activity className="w-4 h-4" /> Dashboard
              </button>
              <button 
                onClick={() => setActiveTab('constants')}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-md transition-colors ${activeTab === 'constants' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <Sliders className="w-4 h-4" /> Constants
              </button>
            </div>
          </div>
        </div>

        {/* WARNINGS BANNER */}
        {results.warnings.length > 0 && activeTab === 'dashboard' && (
          <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-r-xl shadow-sm">
            <div className="flex items-start">
              <AlertTriangle className="text-amber-500 w-5 h-5 mr-3 mt-0.5" />
              <div>
                <h3 className="text-sm font-bold text-amber-800">Engineering Constraints Alert</h3>
                <ul className="mt-1 list-disc list-inside text-sm text-amber-700">
                  {results.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* --- DASHBOARD VIEW --- */}
        {activeTab === 'dashboard' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* LEFT COLUMN: INPUTS */}
            <div className="lg:col-span-4 space-y-6">
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="bg-slate-100 px-5 py-3 border-b border-slate-200 flex items-center gap-2">
                  <Settings className="w-4 h-4 text-slate-500" />
                  <h2 className="font-semibold text-slate-700">System Parameters</h2>
                </div>
                <div className="p-5 space-y-4">
                  
                  <div className="space-y-3 pb-4 border-b border-slate-100">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Traffic & Load</h3>
                    <div>
                      <label className="flex justify-between text-sm font-medium text-slate-600 mb-1">
                        Target Cars per Day <span>{inputs.carsPerDay}</span>
                      </label>
                      <input type="range" name="carsPerDay" min="10" max="100" value={inputs.carsPerDay} onChange={handleInputChange} className="w-full accent-blue-600" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-slate-500 block mb-1">Peak Window (Hrs)</label>
                        <input type="number" name="peakWindowHours" value={inputs.peakWindowHours} onChange={handleInputChange} className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded text-sm" />
                      </div>
                      <div>
                        <label className="text-xs text-slate-500 block mb-1">% in Peak Window</label>
                        <input type="number" name="peakTrafficPercent" value={inputs.peakTrafficPercent} onChange={handleInputChange} className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded text-sm" />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3 pb-4 border-b border-slate-100">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Hardware Spec Limits</h3>
                    <div>
                      <label className="flex justify-between text-sm font-medium text-slate-600 mb-1">
                        Fuel Cell Nameplate (kW) <span>{inputs.fcPower} kW</span>
                      </label>
                      <input type="range" name="fcPower" min="50" max="400" step="10" value={inputs.fcPower} onChange={handleInputChange} className="w-full accent-emerald-500" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-slate-500 block mb-1">EV Ports (Qty)</label>
                        <input type="number" name="numPorts" value={inputs.numPorts} onChange={handleInputChange} className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded text-sm" />
                      </div>
                      <div>
                        <label className="text-xs text-slate-500 block mb-1">Max Port Pwr (kW)</label>
                        <input type="number" name="powerPerPort" value={inputs.powerPerPort} onChange={handleInputChange} className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded text-sm" />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Economics</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-slate-500 block mb-1">Elec. Sell (SAR)</label>
                        <input type="number" name="electricityPrice" step="0.01" value={inputs.electricityPrice} onChange={handleInputChange} className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded text-sm" />
                      </div>
                      <div>
                        <label className="text-xs text-slate-500 block mb-1">LPG Buy (SAR/L)</label>
                        <input type="number" name="lpgPrice" step="0.01" value={inputs.lpgPrice} onChange={handleInputChange} className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded text-sm" />
                      </div>
                    </div>
                  </div>

                </div>
              </div>
            </div>

            {/* RIGHT COLUMN: DASHBOARD CARDS */}
            <div className="lg:col-span-8 space-y-6">
              
              {/* ROW 1: TECHNICAL SIZING */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <p className="text-xs font-bold text-slate-400 uppercase">Required BESS</p>
                      <h3 className="text-2xl font-bold text-slate-800">{results.batteryCapacity.toLocaleString()} <span className="text-sm font-normal text-slate-500">kWh</span></h3>
                    </div>
                    <div className="bg-blue-50 p-2 rounded-lg"><Battery className="w-5 h-5 text-blue-600" /></div>
                  </div>
                  <div className="mt-4 pt-4 border-t border-slate-100">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-500">Peak Discharge</span>
                      <span className="font-semibold text-slate-700">{results.cRate.toFixed(2)} C</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2 overflow-hidden">
                      <div className={`h-1.5 rounded-full ${results.cRate > constants.cRateLimit ? 'bg-red-500' : 'bg-blue-500'}`} style={{ width: `${Math.min(100, (results.cRate / constants.cRateLimit) * 100)}%` }}></div>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1 text-right">DCR Target: ≤ {constants.cRateLimit} C</p>
                  </div>
                </div>

                <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <p className="text-xs font-bold text-slate-400 uppercase">PCS Output Req</p>
                      <h3 className="text-2xl font-bold text-slate-800">{results.pcsPower.toLocaleString()} <span className="text-sm font-normal text-slate-500">kW</span></h3>
                    </div>
                    <div className="bg-emerald-50 p-2 rounded-lg"><Activity className="w-5 h-5 text-emerald-600" /></div>
                  </div>
                  <div className="mt-4 pt-4 border-t border-slate-100">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-500">Max Site Surge</span>
                      <span className="font-semibold text-slate-700">{results.maxSiteLoad.toLocaleString()} kW</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2 overflow-hidden">
                      <div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${(results.pcsPower / Math.max(1, results.maxSiteLoad)) * 100}%` }}></div>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">FC supplies {inputs.fcPower} kW base</p>
                  </div>
                </div>

                <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <p className="text-xs font-bold text-slate-400 uppercase">Container Util</p>
                      <h3 className="text-2xl font-bold text-slate-800">{results.footprintArea.toFixed(1)} <span className="text-sm font-normal text-slate-500">m²</span></h3>
                    </div>
                    <div className="bg-purple-50 p-2 rounded-lg"><Box className="w-5 h-5 text-purple-600" /></div>
                  </div>
                  <div className="mt-4 pt-4 border-t border-slate-100">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-500">Space Utilized</span>
                      <span className="font-semibold text-slate-700">{results.footprintPercent.toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2 overflow-hidden">
                      <div className={`h-1.5 rounded-full ${results.footprintPercent > 95 ? 'bg-red-500' : 'bg-purple-500'}`} style={{ width: `${Math.min(100, results.footprintPercent)}%` }}></div>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">Internal max: {constants.containerArea} m²</p>
                  </div>
                </div>
              </div>

              {/* ROW 2: FINANCIAL ROI */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                 <div className="bg-slate-100 px-5 py-3 border-b border-slate-200 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-slate-500" />
                  <h2 className="font-semibold text-slate-700">Financial Viability</h2>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    
                    <div>
                      <p className="text-sm text-slate-500 font-medium mb-1">Total CAPEX (SAR)</p>
                      <h3 className="text-3xl font-bold text-slate-800">
                        {(results.totalCapexSAR / 1000000).toFixed(2)}M
                      </h3>
                      <p className="text-xs text-slate-400 mt-2">Includes hardware + {((constants.costs.installContingency - 1) * 100).toFixed(0)}% contingency</p>
                    </div>

                    <div className="border-l border-slate-100 pl-8">
                      <p className="text-sm text-slate-500 font-medium mb-1">Gross Annual Profit (SAR)</p>
                      <h3 className="text-3xl font-bold text-emerald-600">
                        {results.annualProfit > 0 ? (results.annualProfit / 1000).toFixed(1) + 'k' : 'Deficit'}
                      </h3>
                      <p className="text-xs text-slate-400 mt-2">
                        <span className="font-semibold text-slate-600">{Math.round(results.dailyProfit).toLocaleString()} SAR</span> daily margin + Ads
                      </p>
                    </div>

                    <div className="border-l border-slate-100 pl-8">
                      <p className="text-sm text-slate-500 font-medium mb-1">Est. Payback Period</p>
                      <div className="flex items-baseline gap-2">
                        <h3 className={`text-3xl font-bold ${results.paybackYears < 7 ? 'text-blue-600' : 'text-amber-500'}`}>
                          {results.paybackYears < 100 ? results.paybackYears.toFixed(1) : '>100'} 
                        </h3>
                        <span className="text-slate-500 font-medium">Years</span>
                      </div>
                      {results.paybackYears < 6 ? (
                        <p className="text-xs text-emerald-600 font-semibold mt-2 flex items-center gap-1"><CheckCircle className="w-3 h-3"/> Highly bankable ROI</p>
                      ) : (
                        <p className="text-xs text-slate-400 mt-2">Target &lt; 6.0 years for prime viability</p>
                      )}
                    </div>

                  </div>
                </div>
              </div>

              {/* ROW 3: HARDWARE LOGIC SUMMARY */}
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                 <h3 className="text-sm font-bold text-slate-700 uppercase mb-4">Architecture Summary</h3>
                 <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                      <p className="text-xs text-slate-500">FC Operating Point</p>
                      <p className="font-semibold text-slate-800 mt-1">{inputs.fcPower * 0.8} kW <span className="text-xs font-normal text-slate-500">(Optimal)</span></p>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                      <p className="text-xs text-slate-500">Battery Chem / Usable</p>
                      <p className="font-semibold text-slate-800 mt-1">LFP / {constants.batteryDoD * 100}% DoD</p>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                      <p className="text-xs text-slate-500">Charger Matrix</p>
                      <p className="font-semibold text-slate-800 mt-1">8 × 90kW DABs</p>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                      <p className="text-xs text-slate-500">Daily Fuel (LPG)</p>
                      <p className="font-semibold text-slate-800 mt-1">{Math.round(((inputs.carsPerDay * inputs.energyPerCar + results.totalAuxPower * 24) / constants.fcEfficiency) / constants.lpgLHV).toLocaleString()} Liters</p>
                    </div>
                 </div>
              </div>

            </div>
          </div>
        )}

        {/* --- CONSTANTS CONFIGURATION VIEW --- */}
        {activeTab === 'constants' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            
            {/* Efficiency & Physics */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="bg-blue-50 px-5 py-3 border-b border-blue-100 flex items-center gap-2">
                <Activity className="w-4 h-4 text-blue-600" />
                <h2 className="font-semibold text-blue-900">Efficiency & Performance</h2>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="text-xs text-slate-500 block mb-1">SOFC Electrical Efficiency (0-1.0)</label>
                  <input type="number" step="0.01" value={constants.fcEfficiency} onChange={(e) => handleConstantChange(null, 'fcEfficiency', e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded text-sm focus:outline-none focus:border-blue-400" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">SOFC Min ZVS Floor (0-1.0)</label>
                  <input type="number" step="0.01" value={constants.fcMinZVS} onChange={(e) => handleConstantChange(null, 'fcMinZVS', e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded text-sm focus:outline-none focus:border-blue-400" />
                  <p className="text-[10px] text-slate-400 mt-1">Minimum load required to prevent shutdown.</p>
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Battery Depth of Discharge (DoD)</label>
                  <input type="number" step="0.01" value={constants.batteryDoD} onChange={(e) => handleConstantChange(null, 'batteryDoD', e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded text-sm focus:outline-none focus:border-blue-400" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Battery Round-Trip Eff. (RTE)</label>
                  <input type="number" step="0.01" value={constants.batteryRTE} onChange={(e) => handleConstantChange(null, 'batteryRTE', e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded text-sm focus:outline-none focus:border-blue-400" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">DCR: Max Battery C-Rate Limit</label>
                  <input type="number" step="0.01" value={constants.cRateLimit} onChange={(e) => handleConstantChange(null, 'cRateLimit', e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded text-sm focus:outline-none focus:border-blue-400" />
                </div>
              </div>
            </div>

            {/* Ancillary & Advertising */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="bg-orange-50 px-5 py-3 border-b border-orange-100 flex items-center gap-2">
                <Monitor className="w-4 h-4 text-orange-600" />
                <h2 className="font-semibold text-orange-900">Ancillary & Advertising</h2>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Base Aux Power (kW) [HVAC/BOP]</label>
                  <input type="number" step="1" value={constants.ancillary.baseAuxPower} onChange={(e) => handleConstantChange('ancillary', 'baseAuxPower', e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded text-sm focus:outline-none focus:border-orange-400" />
                </div>
                <div className="pt-2 border-t border-slate-100">
                  <label className="text-xs text-slate-500 block mb-1">Number of Ad Screens (Qty)</label>
                  <input type="number" step="1" value={constants.ancillary.adScreensQty} onChange={(e) => handleConstantChange('ancillary', 'adScreensQty', e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded text-sm focus:outline-none focus:border-orange-400" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Power Draw Per Screen (kW)</label>
                  <input type="number" step="0.1" value={constants.ancillary.adScreenPowerKW} onChange={(e) => handleConstantChange('ancillary', 'adScreenPowerKW', e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded text-sm focus:outline-none focus:border-orange-400" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Screen Hardware Cost (USD / ea)</label>
                  <input type="number" step="500" value={constants.ancillary.adScreenCostUSD} onChange={(e) => handleConstantChange('ancillary', 'adScreenCostUSD', e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded text-sm focus:outline-none focus:border-orange-400" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Ad Revenue (SAR / mo / ea)</label>
                  <input type="number" step="500" value={constants.ancillary.adRevenuePerScreenSAR} onChange={(e) => handleConstantChange('ancillary', 'adRevenuePerScreenSAR', e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded text-sm focus:outline-none focus:border-orange-400" />
                </div>
              </div>
            </div>

            {/* Financial Multipliers */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="bg-emerald-50 px-5 py-3 border-b border-emerald-100 flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-emerald-600" />
                <h2 className="font-semibold text-emerald-900">Unit CAPEX & Costs</h2>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="text-xs text-slate-500 block mb-1">USD to SAR Conversion Rate</label>
                  <input type="number" step="0.01" value={constants.usdToSar} onChange={(e) => handleConstantChange(null, 'usdToSar', e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded text-sm focus:outline-none focus:border-emerald-400" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Fuel Cell Cost (USD/kW)</label>
                  <input type="number" step="10" value={constants.costs.fcPerKW} onChange={(e) => handleConstantChange('costs', 'fcPerKW', e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded text-sm focus:outline-none focus:border-emerald-400" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Battery Cost (USD/kWh)</label>
                  <input type="number" step="10" value={constants.costs.batteryPerKWh} onChange={(e) => handleConstantChange('costs', 'batteryPerKWh', e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded text-sm focus:outline-none focus:border-emerald-400" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Charger Cost (USD/Port)</label>
                  <input type="number" step="100" value={constants.costs.chargerPerPort} onChange={(e) => handleConstantChange('costs', 'chargerPerPort', e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded text-sm focus:outline-none focus:border-emerald-400" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Balance of Plant / Tanks Fixed (USD)</label>
                  <input type="number" step="1000" value={constants.costs.bopFixed} onChange={(e) => handleConstantChange('costs', 'bopFixed', e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded text-sm focus:outline-none focus:border-emerald-400" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Install & Contingency Multiplier (1.0+)</label>
                  <input type="number" step="0.05" value={constants.costs.installContingency} onChange={(e) => handleConstantChange('costs', 'installContingency', e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded text-sm focus:outline-none focus:border-emerald-400" />
                </div>
              </div>
            </div>

            {/* Spatial Modeling */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="bg-purple-50 px-5 py-3 border-b border-purple-100 flex items-center gap-2">
                <Box className="w-4 h-4 text-purple-600" />
                <h2 className="font-semibold text-purple-900">Spatial & Footprint Targets</h2>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Target Container Internal Area (m²)</label>
                  <input type="number" step="0.1" value={constants.containerArea} onChange={(e) => handleConstantChange(null, 'containerArea', e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded text-sm focus:outline-none focus:border-purple-400" />
                  <p className="text-[10px] text-slate-400 mt-1">Default 28.3 m² is a standard 40ft ISO.</p>
                </div>
                <div className="pt-2 border-t border-slate-100">
                  <label className="text-xs text-slate-500 block mb-1">Battery Density (m² per kWh)</label>
                  <input type="number" step="0.001" value={constants.footprint.batteryPerKWh} onChange={(e) => handleConstantChange('footprint', 'batteryPerKWh', e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded text-sm focus:outline-none focus:border-purple-400" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Fuel Cell Density (m² per kW)</label>
                  <input type="number" step="0.001" value={constants.footprint.fcPerKW} onChange={(e) => handleConstantChange('footprint', 'fcPerKW', e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded text-sm focus:outline-none focus:border-purple-400" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">PCS / Inverter Density (m² per kW)</label>
                  <input type="number" step="0.001" value={constants.footprint.pcsPerKW} onChange={(e) => handleConstantChange('footprint', 'pcsPerKW', e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded text-sm focus:outline-none focus:border-purple-400" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">HVAC / Clearances Fixed (m²)</label>
                  <input type="number" step="0.5" value={constants.footprint.hvacFixed} onChange={(e) => handleConstantChange('footprint', 'hvacFixed', e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded text-sm focus:outline-none focus:border-purple-400" />
                </div>
              </div>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}
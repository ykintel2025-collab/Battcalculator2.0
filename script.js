let scenarioChart, comparisonChart;

const E1A_PROFIEL = [0.033,0.027,0.024,0.022,0.023,0.03,0.043,0.055,0.052,0.045,0.04,0.039,0.038,0.037,0.036,0.038,0.047,0.06,0.065,0.063,0.06,0.055,0.05,0.043];
const WARMTEPOMP_PROFIEL = [0.05,0.05,0.05,0.05,0.05,0.05,0.05,0.04,0.03,0.02,0.02,0.02,0.02,0.02,0.02,0.02,0.03,0.04,0.05,0.05,0.06,0.06,0.05,0.05];
const ZONNEPROFIEL = [0,0,0,0,0,0,0.01,0.03,0.06,0.09,0.11,0.13,0.14,0.13,0.12,0.09,0.05,0.03,0,0,0,0,0,0];
const VAST_TARIEF = 0.35;
const TERUGLEVER_TARIEF = 0.08;

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('select, input[type=number]').forEach(el => el.addEventListener('change', recalculateAndRedraw));
    document.getElementById('lead-gen-form').addEventListener('submit', handleQuoteSubmit);
    recalculateAndRedraw();
});

function handleQuoteSubmit(event) {
    event.preventDefault();
    const state = getCurrentState();
    const calcs = calculateAll(state);
    const naam = document.getElementById('quote-naam').value;
    const email = document.getElementById('quote-email').value;
    let body = `Nieuwe aanvraag via Calculator:\n\nNaam: ${naam}\nE-mail: ${email}\n\n--- Klantconfiguratie ---\n`;
    body += `Basisverbruik: ${state.basisVerbruikKwh} kWh\nEV-verbruik: ${state.evVerbruikKwh} kWh (Laadtijd: ${state.evLaadtijd})\n`;
    body += `Warmtepomp: ${state.wpVerbruikKwh > 0 ? 'Ja' : 'Nee'}\n`;
    body += `Aantal panelen (ingevuld/geschat): ${state.aantalPanelen} stuks\n`;
    body += `Aanbevolen batterij: ${calcs.aanbevolenCapaciteit.toFixed(1)} kWh\n`;
    const subject = encodeURIComponent(`Offerte-aanvraag Zonnepanelen & Batterij`);
    window.location.href = `mailto:jouw-email@voorbeeld.nl?subject=${subject}&body=${encodeURIComponent(body)}`;
}

function recalculateAndRedraw() {
    const state = getCurrentState();
    manageVisibility(state);
    const calculations = calculateAll(state);
    updateUI(state, calculations);
}

function getCurrentState() {
    const heeftZonnepanelen = document.getElementById('heeftZonnepanelen').value === 'ja';
    const interesseZonnepanelen = document.getElementById('interesseZonnepanelen').value === 'ja';
    let aantalPanelen;
    if (heeftZonnepanelen) {
        aantalPanelen = parseInt(document.getElementById('aantalPanelen').value) || 0;
    } else {
        aantalPanelen = interesseZonnepanelen ? parseInt(document.getElementById('woningtype').value) : 0;
    }
    return { 
        heeftZonnepanelen, interesseZonnepanelen,
        basisVerbruikKwh: parseInt(document.getElementById('verbruikSelect').value),
        evVerbruikKwh: parseInt(document.getElementById('evSelect').value),
        wpVerbruikKwh: parseInt(document.getElementById('wpSelect').value),
        evLaadtijd: document.getElementById('evLaadtijd').value,
        aantalPanelen: aantalPanelen,
    };
}

function manageVisibility(state) {
    document.getElementById('ev-laadtijd-container').classList.toggle('hidden', state.evVerbruikKwh === 0);
    document.getElementById('zonnepanelen-huidig-details').classList.toggle('hidden', !state.heeftZonnepanelen);
    document.getElementById('zonnepanelen-interesse-container').classList.toggle('hidden', state.heeftZonnepanelen);
    document.getElementById('woningtype-container').classList.toggle('hidden', state.heeftZonnepanelen || !state.interesseZonnepanelen);
    document.getElementById('lead-gen-card').classList.toggle('hidden', state.heeftZonnepanelen || !state.interesseZonnepanelen);
    
    const showResults = state.aantalPanelen > 0 || (!state.heeftZonnepanelen && !state.interesseZonnepanelen);
    document.getElementById('results-panel').classList.toggle('hidden', !showResults);
}

function calculateAll(state) {
    const DOD = 0.95, RENDEMENT = 0.90, WP_PER_PANEEL = 400, JAAROPBRENGST_FACTOR = 0.9;

    const evVerbruikPerUur = new Array(24).fill(0);
    if (state.evVerbruikKwh > 0) {
        const dagelijksEvVerbruik = state.evVerbruikKwh / 365;
        const laaduren = 6; const laadvermogen = dagelijksEvVerbruik / laaduren;
        if (state.evLaadtijd === 'nacht') {
            for (let i = 22; i < 24; i++) evVerbruikPerUur[i] = laadvermogen;
            for (let i = 0; i < 4; i++) evVerbruikPerUur[i] = laadvermogen;
        } else { for (let i = 10; i < 16; i++) evVerbruikPerUur[i] = laadvermogen; }
    }
    
    const wpVerbruikPerUur = WARMTEPOMP_PROFIEL.map(p => (state.wpVerbruikKwh / 365) * p);
    
    const geschaaldVerbruik = new Array(24).fill(0);
    for (let i = 0; i < 24; i++) { 
        geschaaldVerbruik[i] = (E1A_PROFIEL[i] * (state.basisVerbruikKwh / 365)) + evVerbruikPerUur[i] + wpVerbruikPerUur[i];
    }
    
    let geschaaldeOpbrengst = new Array(24).fill(0);
    if(state.aantalPanelen > 0){
        const totaalWp = state.aantalPanelen * WP_PER_PANEEL;
        const dagelijkseOpbrengstZonnig = (totaalWp * JAAROPBRENGST_FACTOR / 365) * 2.5; // Factor voor een zonnige dag
        geschaaldeOpbrengst = ZONNEPROFIEL.map(p => p * dagelijkseOpbrengstZonnig);
    }
    
    let benodigdeCapaciteit = 0;
    if (state.aantalPanelen > 0) {
        const maximaalOverschot = geschaaldeOpbrengst.reduce((sum, o, i) => sum + Math.max(0, o - geschaaldVerbruik[i]), 0);
        let nachtelijkVerbruik = 0;
        for (let i = 18; i < 24; i++) { nachtelijkVerbruik += geschaaldVerbruik[i]; }
        for (let i = 0; i < 8; i++) { nachtelijkVerbruik += geschaaldVerbruik[i]; }
        benodigdeCapaciteit = Math.min(nachtelijkVerbruik / (DOD * RENDEMENT), maximaalOverschot / RENDEMENT);
    }
    const aanbevolenCapaciteit = Math.max(5, Math.ceil(benodigdeCapaciteit / 5) * 5);
    
    return { aanbevolenCapaciteit, geschaaldVerbruik, geschaaldeOpbrengst };
}

function updateUI(state, calcs){
    document.getElementById('capaciteitResultaat').textContent = `${calcs.aanbevolenCapaciteit.toFixed(1)} kWh`;
    if (state.aantalPanelen === 0) {
         document.getElementById('capaciteitResultaat').textContent = `N.v.t.`;
    }
    
    const simMetBatterij = simulateDay(calcs.geschaaldVerbruik, calcs.geschaaldeOpbrengst, calcs.aanbevolenCapaciteit);
    const simZonderBatterij = simulateDay(calcs.geschaaldVerbruik, calcs.geschaaldeOpbrengst, 0);
    const simZonderAlles = simulateDay(calcs.geschaaldVerbruik, new Array(24).fill(0), 0);
    
    renderComparisonChart(simZonderAlles, simZonderBatterij, simMetBatterij);
    renderScenarioChart(simMetBatterij, calcs);
}

function simulateDay(verbruikData, opbrengstData, batterijCapaciteit) {
    const MAX_RATE_KW = 5;
    const DOD = 0.95;
    const bruikbareCapaciteit = batterijCapaciteit * DOD;
    let batterijLading = 0;
    const result = { verbruikNet:[], verbruikBatterij:[], verbruikZon:[], opbrengstLaden:[], opbrengstExport:[], dagKosten: 0 };

    for (let i = 0; i < 24; i++) {
        let verbruik = verbruikData[i], opbrengst = opbrengstData[i];
        const directGebruik = Math.min(verbruik, opbrengst);
        verbruik -= directGebruik; opbrengst -= directGebruik;
        
        const ontlading = Math.min(verbruik, batterijLading, MAX_RATE_KW);
        verbruik -= ontlading; batterijLading -= ontlading;

        const lading = Math.min(opbrengst, bruikbareCapaciteit - batterijLading, MAX_RATE_KW);
        opbrengst -= lading; batterijLading += lading;
        
        result.dagKosten += verbruik * VAST_TARIEF;
        result.dagKosten -= opbrengst * TERUGLEVER_TARIEF;

        result.verbruikZon.push(directGebruik); result.verbruikBatterij.push(ontlading);
        result.verbruikNet.push(verbruik); result.opbrengstLaden.push(-lading);
        result.opbrengstExport.push(-opbrengst);
    }
    return result;
}

function renderComparisonChart(simZonderAlles, simZonderBatterij, simMetBatterij) {
    const ctx = document.getElementById('comparisonChartCanvas')?.getContext('2d');
    if (!ctx) return;

    const kostenZonderAlles = simZonderAlles.dagKosten * 365;
    const kostenMetPanelen = simZonderBatterij.dagKosten * 365;
    const kostenMetBatterij = simMetBatterij.dagKosten * 365;

    if (comparisonChart) comparisonChart.destroy();
    comparisonChart = new Chart(ctx, {
        type: 'bar',
        data: { 
            labels: ['Zonder Panelen', 'Met Panelen', 'Met Panelen & Batterij'], 
            datasets: [{ 
                label: 'Jaarlijkse Energiekosten (€)', 
                data: [kostenZonderAlles, kostenMetPanelen, kostenMetBatterij], 
                backgroundColor: ['rgba(231, 76, 60, 0.7)', 'rgba(241, 196, 15, 0.7)', 'rgba(46, 204, 113, 0.7)'] 
            }] 
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { title: { display: true, text: 'Geschatte Jaarkosten (€)' } } } }
    });
}

function renderScenarioChart(sim, calcs) {
    const ctx = document.getElementById('scenarioChartCanvas')?.getContext('2d');
    if (!ctx) return;
    
    if (scenarioChart) scenarioChart.destroy();
    scenarioChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: Array.from({length: 24}, (_, i) => `${i}:00`),
            datasets: [
                { label: 'Verbruik van Net', data: sim.verbruikNet, backgroundColor: 'rgba(231, 76, 60, 0.8)', stack: 'Verbruik' },
                { label: 'Verbruik uit Batterij', data: sim.verbruikBatterij, backgroundColor: 'rgba(52, 152, 219, 0.8)', stack: 'Verbruik' },
                { label: 'Direct Verbruik van Zon', data: sim.verbruikZon, backgroundColor: 'rgba(46, 204, 113, 0.8)', stack: 'Verbruik' },
                { label: 'Opbrengst naar Batterij', data: sim.opbrengstLaden, backgroundColor: 'rgba(243, 156, 18, 0.8)', stack: 'Opbrengst' },
                { label: 'Opbrengst naar Net (Export)', data: sim.opbrengstExport, backgroundColor: 'rgba(155, 89, 182, 0.8)', stack: 'Opbrengst' },
                { type: 'line', label: 'Zon-opbrengst', data: calcs.geschaaldeOpbrengst, borderColor: 'rgba(241, 196, 15, 1)', fill: false, pointRadius: 0, borderWidth: 2 }
            ]
        },
        options: { 
            responsive: true, maintainAspectRatio: false, 
            interaction: { mode: 'index', intersect: false },
            plugins: { legend: { position: 'bottom' } }, 
            scales: { 
                x: { stacked: true, grid: { display: false } }, 
                y: { stacked: true, title: { display: true, text: 'Energie (kWh)' } }
            }
        }
    });
}

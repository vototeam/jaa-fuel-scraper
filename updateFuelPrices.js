import fetch from 'node-fetch';
import { load } from 'cheerio';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const companies = ['TEXACO', 'FESCO', 'RUBIS', 'EPPING', 'PETCOM', 'UNIPET', 'COOL OASIS'];

const scrapeAndUpdateAll = async () => {
  const now = new Date().toISOString();
  let totalUpdated = 0;
  let totalInserted = 0;

  // Fetch existing addresses once for reference
  const { data: existingStations, error: fetchError } = await supabase
    .from('GasStation')
    .select('address');

  if (fetchError) {
    console.error('❌ Failed to fetch existing gas stations:', fetchError.message);
    return;
  }

  const existingAddresses = new Set(existingStations.map(s => s.address));

  for (const company of companies) {
    const url = `https://www.calljaa.com/fuel-prices/?parish=ALL&company=${encodeURIComponent(company)}&limit=20&order=`;

    console.log(`🚚 Scraping ${company}...`);
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'text/html'
      }
    });

    const html = await response.text();
    const $ = load(html);
    const updates = [];
    const inserts = [];

    $('.fuel-item').each((i, el) => {
      const name = $(el).find('.item-name--jfm').text().trim();
      const address = $(el).find('.item-address--jfm').text().replace(/\s+/g, ' ').trim();

      const priceMap = {
        'E-10 87': null,
        'E-10 90': null,
        'Diesel': null,
        'ULSD': null
      };

      $(el).find('.fuel-price-data').each((_, priceEl) => {
        const type = $(priceEl).find('.fuel-type').text().trim();
        const price = parseFloat($(priceEl).find('.fuel-price').text().replace('$', '').replace('/L', '').trim());
        if (priceMap.hasOwnProperty(type)) {
          priceMap[type] = isNaN(price) ? null : price;
        }
      });

      const station = {
        name,
        address,
        fuelPrice_87: priceMap['E-10 87'],
        fuelPrice_90: priceMap['E-10 90'],
        fuelPrice_Diesel: priceMap['Diesel'],
        fuelPrice_ULSD: priceMap['ULSD'],
        updated_at: now
      };

      if (existingAddresses.has(address)) {
        updates.push(station);
      } else {
        inserts.push({ ...station, created_at: now });
      }
    });

    for (const station of updates) {
      const { error } = await supabase
        .from('GasStation')
        .update({
          fuelPrice_87: station.fuelPrice_87,
          fuelPrice_90: station.fuelPrice_90,
          fuelPrice_Diesel: station.fuelPrice_Diesel,
          fuelPrice_ULSD: station.fuelPrice_ULSD,
          updated_at: station.updated_at
        })
        .eq('address', station.address);

      if (error) {
        console.error(`❌ Failed to update ${station.address}`, error.message);
      } else {
        console.log(`🔄 Updated prices for: ${station.address}`);
        totalUpdated++;
      }
    }

    for (const station of inserts) {
      const { error } = await supabase
        .from('GasStation')
        .insert(station);

      if (error) {
        console.error(`❌ Failed to insert ${station.address}`, error.message);
      } else {
        console.log(`➕ Inserted new station: ${station.address}`);
        totalInserted++;
      }
    }
  }

  console.log(`\n✅ Finished. Total updated: ${totalUpdated}, Total inserted: ${totalInserted}`);
};

scrapeAndUpdateAll();

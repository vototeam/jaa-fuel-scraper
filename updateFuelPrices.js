const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function scrapeFuelPrices() {
  const response = await axios.get('https://www.jaa.com.jm/fuel-prices/');
  const $ = cheerio.load(response.data);

  const stationData = [];

  $('table tbody tr').each((index, row) => {
    const tds = $(row).find('td');
    const name = $(tds[0]).text().trim();
    const e10 = parseFloat($(tds[1]).text().replace('$', ''));
    const diesel = parseFloat($(tds[2]).text().replace('$', ''));

    if (name) {
      stationData.push({
        name,
        e10,
        diesel
      });
    }
  });

  return stationData;
}

async function syncToSupabase() {
  const scrapedStations = await scrapeFuelPrices();

  const { data: existingStations, error: fetchError } = await supabase
    .from('GasStation')
    .select('id, name');

  if (fetchError) {
    console.error('Error fetching existing stations:', fetchError.message);
    return;
  }

  const updates = [];
  const inserts = [];

  for (const station of scrapedStations) {
    const match = existingStations.find(s => s.name === station.name);

    if (match) {
      updates.push({ id: match.id, e10: station.e10, diesel: station.diesel });
    } else {
      inserts.push(station);
    }
  }

  // Update existing stations
  if (updates.length > 0) {
    for (const update of updates) {
      const { error } = await supabase
        .from('GasStation')
        .update({
          e10: update.e10,
          diesel: update.diesel
        })
        .eq('id', update.id);

      if (error) {
        console.error(`❌ Failed to update ${update.id}: ${error.message}`);
      }
    }
  }

  // Insert new stations
  if (inserts.length > 0) {
    const { error } = await supabase.from('GasStation').insert(inserts);
    if (error) {
      console.error('❌ Failed to insert new stations:', error.message);
    }
  }

  console.log(`✅ Updated ${updates.length} station(s), Inserted ${inserts.length} new station(s).`);
}

syncToSupabase();

import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import 'dotenv/config';

// Supabase setup
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const scrapeAndUpdateFuelPrices = async () => {
  const response = await fetch('https://www.myjaa.net/gas-prices/');
  const html = await response.text();
  const $ = cheerio.load(html);

  const rows = $('table tbody tr');
  const stations = [];

  rows.each((_, row) => {
    const tds = $(row).find('td');
    const name = $(tds[0]).text().trim();
    const e10 = parseFloat($(tds[1]).text().trim()) || null;
    const diesel = parseFloat($(tds[2]).text().trim()) || null;
    const ultraLowDiesel = parseFloat($(tds[3]).text().trim()) || null;

    stations.push({ name, e10, diesel, ultraLowDiesel });
  });

  const { data: existingStations, error: fetchError } = await supabase
    .from('GasStation')
    .select('id, name');

  if (fetchError) {
    console.error('Error fetching existing stations:', fetchError.message);
    return;
  }

  const existingMap = new Map(existingStations.map(s => [s.name.toLowerCase(), s.id]));
  const upserts = [];
  const inserts = [];

  for (const station of stations) {
    const lowerName = station.name.toLowerCase();
    if (existingMap.has(lowerName)) {
      // Update prices only
      upserts.push({
        id: existingMap.get(lowerName),
        e10: station.e10,
        diesel: station.diesel,
        ultraLowDiesel: station.ultraLowDiesel
      });
    } else {
      // Insert new station with name + fuel prices only
      inserts.push({
        name: station.name,
        e10: station.e10,
        diesel: station.diesel,
        ultraLowDiesel: station.ultraLowDiesel
      });
    }
  }

  if (upserts.length > 0) {
    const { error: updateError } = await supabase
      .from('GasStation')
      .upsert(upserts, { onConflict: ['id'] });

    if (updateError) {
      console.error('Error updating stations:', updateError.message);
    } else {
      console.log(`Updated ${upserts.length} stations`);
    }
  }

  if (inserts.length > 0) {
    const { error: insertError } = await supabase
      .from('GasStation')
      .insert(inserts);

    if (insertError) {
      console.error('Error inserting stations:', insertError.message);
    } else {
      console.log(`Inserted ${inserts.length} new stations`);
    }
  }
};

scrapeAndUpdateFuelPrices().catch(console.error);

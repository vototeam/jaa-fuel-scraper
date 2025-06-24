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
  let totalUpdated = 0;
  let totalInserted = 0;

  // Fetch existing addresses once
  const { data: existingStations, error } = await supabase
    .from('GasStation')
    .select('address');

  if (error) {
    console.error('❌ Error fetching existing stations:', error.message);
    return;
  }

  const existingAddresses = new Set(existingStations.map(s => s.address));

  for (const company of companies) {
    const url = `https://www.calljaa.com/fuel-prices/?parish=ALL&company=${encodeURIComponent(company)}&limit=1000`;

    console.log(`🚚 Scraping ${company}...`);
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'text/html'
      }
    });

    const html = await response.text();
    const $ = load(html);

    $('.fuel-item').each(async (_, el) => {
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
        fuelPrice_ULSD: priceMap['ULSD']
      };

      if (existingAddresses.has(address)) {
        // Update prices only
        const { error: updateError } = await supabase
          .from('GasStation')
          .update(station)
          .eq('address', address);

        if (updateError) {
          console.error(`❌ Failed to update: ${address}`, updateError.message);
        } else {
          console.log(`🔁 Updated: ${address}`);
          totalUpdated++;
        }
      } else {
        // Insert new station
        const { error: insertError } = await supabase
          .from('GasStation')
          .insert({ ...station });

        if (insertError) {
          console.error(`❌ Failed to insert: ${address}`, insertError.message);
        } else {
          console.log(`➕ Inserted new: ${address}`);
          totalInserted++;
        }
      }
    });
  }

  console.log(`\n✅ Done. Total Updated: ${totalUpdated}, Total Inserted: ${totalInserted}`);
};

scrapeAndUpdateAll();

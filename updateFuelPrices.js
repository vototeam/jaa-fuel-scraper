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

      updates.push({
        name,
        address,
        fuelPrice_87: priceMap['E-10 87'],
        fuelPrice_90: priceMap['E-10 90'],
        fuelPrice_Diesel: priceMap['Diesel'],
        fuelPrice_ULSD: priceMap['ULSD']
      });
    });

    console.log(`🔄 Processing ${updates.length} stations for ${company}...`);

    for (const station of updates) {
      const { data, error: fetchError } = await supabase
        .from('GasStation')
        .select('id')
        .eq('address', station.address)
        .maybeSingle();

      if (fetchError) {
        console.error(`❌ Error checking ${station.address}:`, fetchError.message);
        continue;
      }

      if (data) {
        // Station exists — update fuel prices
        const { error: updateError } = await supabase
          .from('GasStation')
          .update({
            fuelPrice_87: station.fuelPrice_87,
            fuelPrice_90: station.fuelPrice_90,
            fuelPrice_Diesel: station.fuelPrice_Diesel,
            fuelPrice_ULSD: station.fuelPrice_ULSD
          })
          .eq('address', station.address);

        if (updateError) {
          console.error(`❌ Failed to update ${station.address}:`, updateError.message);
        } else {
          totalUpdated++;
        }
      } else {
        // Station does not exist — insert
        const { error: insertError } = await supabase
          .from('GasStation')
          .insert(station);

        if (insertError) {
          console.error(`❌ Failed to insert ${station.address}:`, insertError.message);
        } else {
          totalInserted++;
        }
      }
    }
  }

  console.log(`\n✅ Done. ${totalUpdated} stations updated, ${totalInserted} stations inserted.`);
};

scrapeAndUpdateAll();

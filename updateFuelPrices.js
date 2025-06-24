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

  for (const company of companies) {
    console.log(`🚚 Scraping ${company}...`);
    let page = 1;
    let hasMore = true;
    const updates = [];

    while (hasMore) {
      const url = `https://www.calljaa.com/fuel-prices/?parish=ALL&company=${encodeURIComponent(company)}&page=${page}`;

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Accept': 'text/html'
        }
      });

      const html = await response.text();
      const $ = load(html);
      const stationsOnPage = [];

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

        stationsOnPage.push({
          name,
          address,
          fuelPrice_87: priceMap['E-10 87'],
          fuelPrice_90: priceMap['E-10 90'],
          fuelPrice_Diesel: priceMap['Diesel'],
          fuelPrice_ULSD: priceMap['ULSD'],
          created_at: now
        });
      });

      console.log(`📄 Page ${page}: Found ${stationsOnPage.length} stations`);

      if (stationsOnPage.length === 0) {
        hasMore = false;
      } else {
        updates.push(...stationsOnPage);
        page++;
      }
    }

    console.log(`🔄 Upserting ${updates.length} stations for ${company}...`);

    for (const station of updates) {
      const { data: existing, error: fetchError } = await supabase
        .from('GasStation')
        .select('*')
        .eq('address', station.address)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') {
        console.error(`❌ Fetch error for ${station.address}: ${fetchError.message}`);
        continue;
      }

      const isNew = !existing;
      const hasChanged = isNew || (
        existing.fuelPrice_87 !== station.fuelPrice_87 ||
        existing.fuelPrice_90 !== station.fuelPrice_90 ||
        existing.fuelPrice_Diesel !== station.fuelPrice_Diesel ||
        existing.fuelPrice_ULSD !== station.fuelPrice_ULSD
      );

      if (hasChanged) {
        const { error: upsertError } = await supabase
          .from('GasStation')
          .upsert(station, { onConflict: 'address' });

        if (upsertError) {
          console.error(`❌ Failed to upsert ${station.address}`, upsertError.message);
        } else {
          isNew ? totalInserted++ : totalUpdated++;
          console.log(`✅ ${isNew ? 'Inserted' : 'Updated'}: ${station.address}`);
        }
      } else {
        console.log(`⏭️ Skipped (no change): ${station.address}`);
      }
    }
  }

  console.log(`\n✅ Finished. Total updated: ${totalUpdated}, Total inserted: ${totalInserted}`);
};

scrapeAndUpdateAll();

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://lmpleqndkgsnalwwlzxx.supabase.co';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseAnonKey) {
    console.error("VITE_SUPABASE_ANON_KEY is empty or missing!");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function syncBackup() {
    console.log("Connecting to Supabase at URL:", supabaseUrl);
    try {
        const { data, error } = await supabase.from('products').select('*');
        if (error) throw error;
        
        console.log(`Success! Recovered ${data?.length || 0} product backups from Supabase.`);
        fs.writeFileSync('supabase_products.json', JSON.stringify(data, null, 2), 'utf8');
        console.log("Wrote backups to supabase_products.json");
    } catch (e: any) {
        console.error("Failed to read from Supabase:", e.message);
    }
}

syncBackup().then(() => process.exit(0));

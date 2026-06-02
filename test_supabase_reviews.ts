import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://lmpleqndkgsnalwwlzxx.supabase.co';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function syncReviews() {
    console.log("Checking Supabase for 'reviews' table...");
    try {
        const { data, error } = await supabase.from('reviews').select('*');
        if (error) throw error;
        
        console.log(`Success! Recovered ${data?.length || 0} reviews from Supabase.`);
        fs.writeFileSync('supabase_reviews.json', JSON.stringify(data, null, 2), 'utf8');
        console.log("Wrote reviews to supabase_reviews.json");
    } catch (e: any) {
        console.warn("Failed to read 'reviews' table, it might not exist:", e.message);
    }
}

syncReviews().then(() => process.exit(0));

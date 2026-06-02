import { initializeApp } from 'firebase/app';
import { getStorage, ref, listAll, getDownloadURL } from 'firebase/storage';
import rawConfig from './firebase-applet-config.json' with { type: 'json' };

const firebaseConfig = {
  apiKey: rawConfig.apiKey,
  authDomain: rawConfig.authDomain,
  projectId: rawConfig.projectId,
  storageBucket: rawConfig.storageBucket, // "allshop-store-70851.firebasestorage.app"
  messagingSenderId: rawConfig.messagingSenderId,
  appId: rawConfig.appId,
};

const app = initializeApp(firebaseConfig);
const storage = getStorage(app);

async function listDir(path: string = "") {
    console.log(`\n--- LISTING STORAGE: "${path}" ---`);
    const listRef = ref(storage, path);
    try {
        const res = await listAll(listRef);
        console.log(`Found ${res.prefixes.length} folders and ${res.items.length} files.`);
        
        for (const folderRef of res.prefixes) {
            console.log(` [Folder] ${folderRef.fullPath}`);
            // Recurse down one level
            if (path === "") {
                await listDir(folderRef.fullPath);
            }
        }
        
        for (const itemRef of res.items) {
            try {
                const url = await getDownloadURL(itemRef);
                console.log(` [File] ${itemRef.fullPath} -> url: ${url}`);
            } catch (urlErr: any) {
                console.log(` [File] ${itemRef.fullPath} -> (Could not get URL: ${urlErr.message})`);
            }
        }
    } catch (e: any) {
        console.error(`Error listing "${path}":`, e.message);
    }
}

listDir("").then(() => process.exit(0));

console.log("Analyzing environment keys...");
console.log(
    Object.keys(process.env).filter(k => 
        k.toUpperCase().includes("FIREBASE") || 
        k.toUpperCase().includes("GOOGLE") || 
        k.toUpperCase().includes("KEY") || 
        k.toUpperCase().includes("SECRET") ||
        k.toUpperCase().includes("CREDENTIAL")
    )
);
process.exit(0);

import { Router } from "express";

const router = Router();

// Map app activity types to Geoapify categories
const typeToGeoapifyCat: Record<string, string> = {
  bowling: "entertainment.bowling_alley",
  golf: "sport",
  clubbing: "entertainment",
  cafe_hopping: "catering.cafe",
  movie: "entertainment.cinema",
  workout: "sport.fitness",
  gaming: "entertainment.activity_park",
  pickleball: "sport", 
  default: "entertainment", // fallback
};

// Fallback images based on category since Geoapify doesn't provide images
const CATEGORY_IMAGES: Record<string, string> = {
  bowling: "https://images.unsplash.com/photo-1511512578047-dfb367046420?w=600&h=400&fit=crop",
  golf: "https://images.unsplash.com/photo-1587334274328-64186a80aeee?w=600&h=400&fit=crop",
  clubbing: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&h=400&fit=crop",
  movie: "https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?w=600&h=400&fit=crop",
  cafe_hopping: "https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=600&h=400&fit=crop",
  workout: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=600&h=400&fit=crop",
  gaming: "https://images.unsplash.com/photo-1511512578047-dfb367046420?w=600&h=400&fit=crop",
  default: "https://images.unsplash.com/photo-1506748686214-e9df14d4d9d0?w=600&h=400&fit=crop",
};

router.get("/", async (req, res) => {
  try {
    const { lat, lng, type } = req.query;
    const apiKey = process.env.GEOAPIFY_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: "GEOAPIFY_API_KEY is missing in backend .env" });
    }
    if (!lat || !lng) {
      return res.status(400).json({ error: "lat and lng are required" });
    }

    const activityType = typeof type === "string" ? type : "default";
    const category = typeToGeoapifyCat[activityType] || typeToGeoapifyCat["default"];
    const radius = 25000; // Increased to 25km radius to find more places

    // Use Places API with categories. 
    // We add conditions=named to ensure we get actual places, not generic areas.
    const geoapifyUrl = `https://api.geoapify.com/v2/places?categories=${category}&filter=circle:${lng},${lat},${radius}&conditions=named&limit=15&apiKey=${apiKey}`;
    
    const response = await fetch(geoapifyUrl, {
      method: "GET",
      headers: { "Accept": "application/json" }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Geoapify API Error: ${response.status} ${response.statusText} - ${errorText}`);
      throw new Error(`Failed to fetch from Geoapify API: ${response.status}`);
    }

    const data: any = await response.json();

    let places = (data.features || []).map((feature: any) => {
      const props = feature.properties;
      const locationStr = [props.street, props.city].filter(Boolean).join(", ") || props.formatted || "Nearby";
      
      let distStr = "";
      if (props.distance) {
        distStr = props.distance < 1000 ? `${props.distance}m` : `${(props.distance / 1000).toFixed(1)}km`;
      }

      return {
        id: props.place_id,
        name: props.name || props.address_line1 || `Local ${activityType.replace('_', ' ')} spot`,
        location: locationStr + (distStr ? ` (${distStr})` : ""),
        contact: props.contact?.phone || props.phone || "N/A",
        website: props.website || null,
        opening_hours: props.opening_hours || "Depends on venue",
        price: "Depends on venue",
        rating: (4.0 + Math.random()).toFixed(1), // Mock rating since Geoapify doesn't reliably have it
        image: CATEGORY_IMAGES[activityType] || CATEGORY_IMAGES["default"],
      };
    });

    if (places.length === 0) {
      places = [
        {
          id: "mock-1",
          name: `Awesome ${activityType.replace('_', ' ')} Arena`,
          location: "Downtown",
          contact: "N/A",
          opening_hours: "10:00 AM - 10:00 PM",
          price: "Depends on venue",
          rating: "4.5",
          image: CATEGORY_IMAGES[activityType] || CATEGORY_IMAGES["default"],
        }
      ];
    }

    res.json({ places });
  } catch (error) {
    console.error("Error fetching places:", error);
    res.status(500).json({ error: "Failed to fetch places" });
  }
});

router.get("/reverse", async (req, res) => {
  try {
    const { lat, lng } = req.query;
    if (!lat || !lng) {
      return res.status(400).json({ error: "lat and lng are required" });
    }

    const apiKey = process.env.GEOAPIFY_API_KEY;
    if (apiKey) {
      try {
        const geoapifyUrl = `https://api.geoapify.com/v1/geocode/reverse?lat=${lat}&lon=${lng}&format=json&apiKey=${apiKey}`;
        const response = await fetch(geoapifyUrl, { headers: { Accept: "application/json" } });
        if (response.ok) {
          const data: any = await response.json();
          if (data.results && data.results.length > 0) {
            const r = data.results[0];
            const city = r.city || r.suburb || r.county || r.state || r.country || "Nearby";
            const neighborhood = r.suburb || r.neighbourhood || r.district || "";
            const displayName = neighborhood && city !== neighborhood ? `${neighborhood}, ${city}` : (r.city || r.name || r.formatted);
            return res.json({
              name: displayName,
              city: city,
              formatted: r.formatted,
              lat: Number(r.lat),
              lng: Number(r.lon)
            });
          }
        }
      } catch (e) {
        console.warn("Geoapify reverse geocode failed, falling back to OSM", e);
      }
    }

    // OpenStreetMap Nominatim Fallback
    try {
      const osmUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=14&addressdetails=1`;
      const osmRes = await fetch(osmUrl, {
        headers: { "User-Agent": "LoomusApp/1.0 (contact@loomus.app)" }
      });
      if (osmRes.ok) {
        const osmData: any = await osmRes.json();
        const addr = osmData.address || {};
        const city = addr.city || addr.town || addr.suburb || addr.county || addr.state || "Nearby";
        const neighborhood = addr.suburb || addr.neighbourhood || addr.residential || "";
        const displayName = neighborhood && city !== neighborhood ? `${neighborhood}, ${city}` : (city || osmData.display_name);
        return res.json({
          name: displayName,
          city: city,
          formatted: osmData.display_name,
          lat: Number(osmData.lat),
          lng: Number(osmData.lon)
        });
      }
    } catch (osmErr) {
      console.warn("OSM reverse geocode failed:", osmErr);
    }

    return res.json({
      name: "Current Location",
      city: "Current Location",
      formatted: "Current Location",
      lat: Number(lat),
      lng: Number(lng)
    });
  } catch (error) {
    console.error("Error in reverse geocoding:", error);
    res.status(500).json({ error: "Failed to reverse geocode" });
  }
});

router.get("/search", async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || typeof q !== "string") {
      return res.status(400).json({ error: "Search query 'q' is required" });
    }

    const apiKey = process.env.GEOAPIFY_API_KEY;
    if (apiKey) {
      try {
        const geoapifyUrl = `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(q)}&format=json&limit=1&apiKey=${apiKey}`;
        const response = await fetch(geoapifyUrl, { headers: { Accept: "application/json" } });
        if (response.ok) {
          const data: any = await response.json();
          if (data.results && data.results.length > 0) {
            const result = data.results[0];
            return res.json({
              lat: result.lat,
              lng: result.lon,
              name: result.city || result.name || result.formatted
            });
          }
        }
      } catch (e) {
        console.warn("Geoapify search failed, falling back to OSM", e);
      }
    }

    // Fallback: OpenStreetMap Nominatim
    try {
      const osmUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&addressdetails=1`;
      const osmRes = await fetch(osmUrl, {
        headers: { "User-Agent": "LoomusApp/1.0 (contact@loomus.app)" }
      });
      if (osmRes.ok) {
        const results: any = await osmRes.json();
        if (results && results.length > 0) {
          const r = results[0];
          const addr = r.address || {};
          return res.json({
            lat: parseFloat(r.lat),
            lng: parseFloat(r.lon),
            name: addr.city || addr.town || addr.suburb || r.display_name
          });
        }
      }
    } catch (osmErr) {
      console.warn("OSM search failed:", osmErr);
    }

    res.status(404).json({ error: "Location not found" });
  } catch (error) {
    console.error("Error searching location:", error);
    res.status(500).json({ error: "Failed to search location" });
  }
});

router.get("/autocomplete", async (req, res) => {
  try {
    const { q, lat, lng, lon } = req.query;
    if (!q || typeof q !== "string" || !q.trim()) {
      return res.json({ suggestions: [] });
    }

    const query = q.trim();
    const latitude = lat ? Number(lat) : undefined;
    const longitude = (lng || lon) ? Number(lng || lon) : undefined;
    const apiKey = process.env.GEOAPIFY_API_KEY;

    let suggestions: any[] = [];

    // 1. Try Geoapify Autocomplete
    if (apiKey) {
      try {
        let geoapifyUrl = `https://api.geoapify.com/v1/geocode/autocomplete?text=${encodeURIComponent(query)}&format=json&limit=6&apiKey=${apiKey}`;
        if (latitude && longitude) {
          geoapifyUrl += `&bias=proximity:${longitude},${latitude}`;
        }
        
        const response = await fetch(geoapifyUrl, { headers: { Accept: "application/json" } });
        if (response.ok) {
          const data: any = await response.json();
          if (data.results && data.results.length > 0) {
            suggestions = data.results.map((r: any) => ({
              lat: r.lat,
              lng: r.lon,
              name: r.city || r.name || r.formatted,
              full_address: r.formatted,
              category: r.category || r.result_type
            }));
          }
        }
      } catch (e) {
        console.warn("Geoapify autocomplete error, trying Photon fallback", e);
      }
    }

    // 2. Fallback to Photon (Free OpenStreetMap-powered geocoding engine)
    if (suggestions.length === 0) {
      try {
        let photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=6`;
        if (latitude && longitude) {
          photonUrl += `&lat=${latitude}&lon=${longitude}`;
        }
        const photonRes = await fetch(photonUrl, { headers: { Accept: "application/json" } });
        if (photonRes.ok) {
          const photonData: any = await photonRes.json();
          if (photonData.features && photonData.features.length > 0) {
            suggestions = photonData.features.map((f: any) => {
              const p = f.properties;
              const coords = f.geometry.coordinates; // [lng, lat]
              const nameParts = [p.name, p.district, p.city, p.state, p.country].filter(Boolean);
              const name = p.name || p.city || nameParts[0] || query;
              const full_address = nameParts.filter((v, i, a) => a.indexOf(v) === i).join(", ");
              return {
                lat: coords[1],
                lng: coords[0],
                name: name,
                full_address: full_address
              };
            });
          }
        }
      } catch (photonErr) {
        console.warn("Photon fallback failed, trying Nominatim", photonErr);
      }
    }

    // 3. Fallback to Nominatim
    if (suggestions.length === 0) {
      try {
        const osmUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=6&addressdetails=1`;
        const osmRes = await fetch(osmUrl, {
          headers: { "User-Agent": "LoomusApp/1.0 (contact@loomus.app)" }
        });
        if (osmRes.ok) {
          const osmResults: any = await osmRes.json();
          if (osmResults && osmResults.length > 0) {
            suggestions = osmResults.map((r: any) => {
              const addr = r.address || {};
              const name = addr.city || addr.town || addr.suburb || addr.neighbourhood || r.name || r.display_name.split(",")[0];
              return {
                lat: parseFloat(r.lat),
                lng: parseFloat(r.lon),
                name: name,
                full_address: r.display_name
              };
            });
          }
        }
      } catch (osmErr) {
        console.warn("Nominatim fallback failed:", osmErr);
      }
    }

    // Deduplicate by name and full_address
    const seen = new Set<string>();
    const deduplicated = suggestions.filter((s: any) => {
      const key = `${s.name}_${s.lat.toFixed(3)}_${s.lng.toFixed(3)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    res.json({ suggestions: deduplicated });
  } catch (error) {
    console.error("Error autocompleting location:", error);
    res.status(500).json({ error: "Failed to autocomplete" });
  }
});

router.get("/ip-location", async (req, res) => {
  try {
    let clientIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "";
    if (Array.isArray(clientIp)) clientIp = clientIp[0];
    if (typeof clientIp === "string" && clientIp.includes(",")) {
      clientIp = clientIp.split(",")[0].trim();
    }

    const isLocal = !clientIp || clientIp === "::1" || clientIp.startsWith("127.") || clientIp.startsWith("192.168.") || clientIp.startsWith("10.");
    const url = isLocal ? "http://ip-api.com/json" : `http://ip-api.com/json/${clientIp}`;

    const ipRes = await fetch(url, { headers: { Accept: "application/json" } });
    if (ipRes.ok) {
      const data: any = await ipRes.json();
      if (data && data.status === "success") {
        return res.json({
          name: `${data.city || data.regionName}, ${data.country}`,
          city: data.city || data.regionName,
          lat: data.lat,
          lng: data.lon,
        });
      }
    }

    res.status(404).json({ error: "Could not resolve IP location" });
  } catch (err) {
    console.error("IP location error:", err);
    res.status(500).json({ error: "Failed to get IP location" });
  }
});

export default router;

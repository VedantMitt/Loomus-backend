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

router.get("/search", async (req, res) => {
  try {
    const { q } = req.query;
    const apiKey = process.env.GEOAPIFY_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: "GEOAPIFY_API_KEY is missing" });
    }
    if (!q || typeof q !== "string") {
      return res.status(400).json({ error: "Search query 'q' is required" });
    }

    const geoapifyUrl = `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(q)}&format=json&limit=1&apiKey=${apiKey}`;
    
    const response = await fetch(geoapifyUrl, {
      method: "GET",
      headers: { "Accept": "application/json" }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch from Geoapify Geocoding: ${response.status}`);
    }

    const data: any = await response.json();
    if (data.results && data.results.length > 0) {
      const result = data.results[0];
      res.json({
        lat: result.lat,
        lng: result.lon,
        name: result.city || result.name || result.formatted
      });
    } else {
      res.status(404).json({ error: "Location not found" });
    }
  } catch (error) {
    console.error("Error searching location:", error);
    res.status(500).json({ error: "Failed to search location" });
  }
});

router.get("/autocomplete", async (req, res) => {
  try {
    const { q } = req.query;
    const apiKey = process.env.GEOAPIFY_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: "GEOAPIFY_API_KEY is missing" });
    }
    if (!q || typeof q !== "string") {
      return res.json({ suggestions: [] });
    }

    const geoapifyUrl = `https://api.geoapify.com/v1/geocode/autocomplete?text=${encodeURIComponent(q)}&format=json&limit=5&apiKey=${apiKey}`;
    
    const response = await fetch(geoapifyUrl, {
      method: "GET",
      headers: { "Accept": "application/json" }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch from Geoapify Autocomplete: ${response.status}`);
    }

    const data: any = await response.json();
    if (data.results && data.results.length > 0) {
      const suggestions = data.results.map((r: any) => ({
        lat: r.lat,
        lng: r.lon,
        name: r.city || r.name || r.formatted,
        full_address: r.formatted
      })).filter((v: any, i: number, a: any[]) => a.findIndex(t => (t.name === v.name)) === i); // basic dedupe

      res.json({ suggestions });
    } else {
      res.json({ suggestions: [] });
    }
  } catch (error) {
    console.error("Error autocompleting location:", error);
    res.status(500).json({ error: "Failed to autocomplete" });
  }
});

export default router;

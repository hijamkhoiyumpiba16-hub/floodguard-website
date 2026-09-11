async function getNews({ location = "Global", category = "all" }) {
  const gdeltCategoryTerms = {
    all: "",
    disaster: "flood OR storm OR hurricane OR rain OR cyclone",
    entertainment: "cinema OR movie OR music OR concert",
    food: "cuisine OR chef OR culinary OR restaurant",
    racing: "F1 OR motorsport OR rally OR race",
    fighting: "UFC OR boxing OR MMA OR championship",
    tech: "AI OR technology OR robotics OR software",
    world: "treaty OR summit OR diplomatic OR government"
  };

  const term = gdeltCategoryTerms[category] || "";
  const query = [location !== "Global" ? location : "", term].filter(Boolean).join(" ") || "world";
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=artlist&maxrecords=12&format=json`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      if (data.articles && data.articles.length > 0) {
        return data.articles.map(a => ({
          category: category === "all" ? "world" : category,
          title: a.title,
          snippet: a.seendate ? `Reported live via ${a.domain}` : "Breaking world event.",
          image: a.socialimage || "https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=800",
          source: a.domain || "GDELT Open Wire",
          time: "Recent",
          place: location,
          url: a.url
        }));
      }
    }
  } catch (err) {
    // Fall back to empty array if GDELT is busy; caller can inject fallback pool
  }
  return [];
}

module.exports = { getNews };
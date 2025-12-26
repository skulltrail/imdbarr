import { fetchIMDBList, filterTVShows } from '../src/imdb.js';

async function main() {
  const id = process.argv[2] || 'ur12345678';

  console.log(`[Debug] Fetching all pages for ${id}...`);

  try {
    // fetchIMDBList handles all pagination automatically
    const items = await fetchIMDBList(id, { fetchAll: true });
    const tv = filterTVShows(items);

    const typeCounts = items.reduce<Record<string, number>>((acc, it) => {
      acc[it.type] = (acc[it.type] || 0) + 1;
      return acc;
    }, {});

    console.log(
      JSON.stringify(
        {
          id,
          totalItems: items.length,
          tvShowCount: tv.length,
          typeCounts,
          tvTitles: tv.map((t) => t.title),
        },
        null,
        2
      )
    );
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();

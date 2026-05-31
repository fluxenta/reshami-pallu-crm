require('dotenv').config({ path: '.env.local' });
const shopifyAdminFetch = async (query) => {
  const res = await fetch(`https://${process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN}/admin/api/2024-01/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': process.env.SHOPIFY_ADMIN_ACCESS_TOKEN
    },
    body: JSON.stringify(query)
  });
  return res.json();
};

(async () => {
  const query = {
    query: `
      query {
        __type(name: "ProductInput") {
          inputFields {
            name
            type {
              name
              kind
              ofType {
                name
                kind
              }
            }
          }
        }
      }
    `
  };
  try {
    const res = await shopifyAdminFetch(query);
    console.log(JSON.stringify(res.data.__type.inputFields.map(f => f.name)));
  } catch (err) {
    console.error(err);
  }
})();

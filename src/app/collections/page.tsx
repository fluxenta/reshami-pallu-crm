import { shopifyCollection } from "@/lib/shopify";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import CollectionsList from "@/components/collections/CollectionsList";

export const revalidate = 0; // Dynamic server component

export default async function CollectionsPage() {
  let collections: any[] = [];

  try {
    collections = await shopifyCollection.list(250);
  } catch (error) {
    console.error("Failed to fetch collections:", error);
  }

  return (
    <div className="flex min-h-screen bg-[#FAF8F5]">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Collections Manager" />
        
        <main className="flex-1 overflow-y-auto p-4 sm:p-8 max-w-[1000px] mx-auto w-full">
          <CollectionsList initialCollections={collections} />
        </main>
      </div>
    </div>
  );
}

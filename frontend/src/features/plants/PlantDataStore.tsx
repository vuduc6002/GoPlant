import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

export type PlantProfile = {
  id: string;
  name: string;
  scientificName: string;
  category: string;
  difficulty?: string;
  light?: string;
  water?: string;
  environment?: string;
  space?: string;
  matureSize?: string;
  temperature?: string;
  humidity?: string;
  medium?: string;
  drainage?: string;
  soilPh?: string;
  sunTolerance?: string;
  origin?: string;
  overview?: string;
  morphology?: string;
  lifespan?: string;
  floweringSeason?: string;
  usageAndCaution?: string;
  growthRate?: string;
  wateringFrequency?: string;
  nutrition?: string;
};

export type OwnedPlant = {
  id: string;
  catalogId: string;
  name: string;
  scientificName: string;
  category: string;
  plantedAt: string;
  location: string;
  note: string;
};

export const plantCatalog: PlantProfile[] = [
  { id: 'monstera-deliciosa', name: 'Trầu bà lá xẻ', scientificName: 'Monstera deliciosa', category: 'Cây cảnh' },
  { id: 'epipremnum-marble-queen', name: 'Trầu bà cẩm thạch', scientificName: "Epipremnum aureum 'Marble Queen'", category: 'Cây cảnh' },
  { id: 'philodendron-hope', name: 'Trầu bà Thanh Xuân', scientificName: 'Philodendron bipinnatifidum', category: 'Cây cảnh' },
  { id: 'philodendron-imperial-red', name: 'Trầu bà Đế Vương đỏ', scientificName: "Philodendron 'Imperial Red'", category: 'Cây cảnh' },
  { id: 'philodendron-pedatum', name: 'Trầu bà Tay Phật', scientificName: 'Philodendron pedatum', category: 'Cây cảnh' },
];

type PlantDataContextValue = {
  ownedPlants: OwnedPlant[];
  favorites: string[];
  addPlant: (plant: Omit<OwnedPlant, 'id'>) => string;
  updatePlant: (id: string, plant: Omit<OwnedPlant, 'id'>) => void;
  removePlant: (id: string) => void;
  toggleFavorite: (catalogId: string) => void;
};

const PlantDataContext = createContext<PlantDataContextValue | null>(null);

export function PlantDataProvider({ children }: { children: ReactNode }) {
  const [ownedPlants, setOwnedPlants] = useState<OwnedPlant[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const value = useMemo<PlantDataContextValue>(() => ({
    ownedPlants,
    favorites,
    addPlant: (plant) => {
      const id = `demo-plant-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setOwnedPlants((items) => [...items, { ...plant, id }]);
      return id;
    },
    updatePlant: (id, plant) => setOwnedPlants((items) => items.map((item) => item.id === id ? { ...plant, id } : item)),
    removePlant: (id) => setOwnedPlants((items) => items.filter((item) => item.id !== id)),
    toggleFavorite: (catalogId) => setFavorites((items) => items.includes(catalogId) ? items.filter((item) => item !== catalogId) : [...items, catalogId]),
  }), [ownedPlants, favorites]);

  return <PlantDataContext.Provider value={value}>{children}</PlantDataContext.Provider>;
}

export function usePlantData() {
  const context = useContext(PlantDataContext);
  if (!context) throw new Error('usePlantData must be used inside PlantDataProvider');
  return context;
}

import React, { useState, useEffect } from 'react';
import styles from './inventory.module.css';

interface FilterValues {
  priceMin?: number;
  priceMax?: number;
  colour?: string;
  fabric?: string;
}

interface FilterBarProps {
  onChange: (filters: FilterValues) => void;
  availableColours?: string[];
  availableFabrics?: string[];
}

export const FilterBar: React.FC<FilterBarProps> = ({ onChange, availableColours = [], availableFabrics = [] }) => {
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [colour, setColour] = useState('');
  const [fabric, setFabric] = useState('');


  // Notify parent when any filter changes
  useEffect(() => {
    const filters: FilterValues = {
      priceMin: priceMin ? Number(priceMin) : undefined,
      priceMax: priceMax ? Number(priceMax) : undefined,
      colour: colour || undefined,
      fabric: fabric || undefined,
    };
    onChange(filters);
  }, [priceMin, priceMax, colour, fabric]);

  return (
    <div className={styles.filterBar}>
      <div className={styles.filterGroup}>
        <label htmlFor="price-min">Min Price</label>
        <input
          id="price-min"
          type="number"
          placeholder="0"
          value={priceMin}
          onChange={e => setPriceMin(e.target.value)}
        />
      </div>
      <div className={styles.filterGroup}>
        <label htmlFor="price-max">Max Price</label>
        <input
          id="price-max"
          type="number"
          placeholder="2000"
          value={priceMax}
          onChange={e => setPriceMax(e.target.value)}
        />
      </div>
      <div className={styles.filterGroup}>
        <label htmlFor="colour-select">Colour</label>
        <select id="colour-select" value={colour} onChange={e => setColour(e.target.value)}>
          <option value="">All</option>
          {availableColours.map(c => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <div className={styles.filterGroup}>
        <label htmlFor="fabric-select">Fabric</label>
        <select id="fabric-select" value={fabric} onChange={e => setFabric(e.target.value)}>
          <option value="">All</option>
          {availableFabrics.map(f => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </div>

    </div>
  );
};

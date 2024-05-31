import { ChangeEvent, useState } from 'react';
import './App.css';
import Table from './shared/Table';

export type ShareData = {
  current_price: number;
  difference: string;
  name: string;
  price: number;
  shares: number;
  target_price: string;
};

function App() {
  const [data, setData] = useState<ShareData[] | null>(null);
  const handleChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const formData = new FormData();

    const file = e.target.files?.[0];

    if (file) {
      formData.append('file', file);

      const resp = await fetch('http://127.0.0.1:8000/api/', {
        method: 'POST',
        body: formData,
      });
      const jsonData = await resp.json();

      setData(jsonData.data);
    }
  };

  const handleProfitChange = (e: ChangeEvent<HTMLInputElement>) => {
    const profit = Number(e.target.value);

    if (!data) return;

    setData((prevData) => {
      if (!prevData) return prevData;

      return prevData.map((data) => {
        const difference = Number(data.difference.split('%')[0]);

        if (difference < profit) {
          const target_price = data.price * (profit / 100) + data.price;
          return { ...data, target_price: target_price.toFixed(2) };
        }

        return data;
      });
    });
  };

  return (
    <>
      <input type="file" onChange={handleChange} />

      {data ? (
        <div className="flex flex-col justify-center items-center my-5">
          <label htmlFor="profit">Desired profit</label>
          <input
            className="w-1/2 mb-5 mt-2 rounded text-slate-950 font-medium py-2 px-3"
            type="number"
            onChange={handleProfitChange}
          />
          <Table data={data} />
        </div>
      ) : null}
    </>
  );
}

export default App;

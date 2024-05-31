import { Table as TableContainer, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

import { ShareData } from '../../App.tsx';

type Props = {
  data: ShareData[];
};

const Table = ({ data }: Props) => {
  return (
    <TableContainer>
      <TableHeader>
        <TableRow>
          <TableHead className="capitalize">name</TableHead>
          <TableHead className="capitalize">shares</TableHead>
          <TableHead className="capitalize">price</TableHead>
          <TableHead className="capitalize">current price</TableHead>
          <TableHead className="capitalize">difference</TableHead>
          <TableHead className="capitalize">target price</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map(({ name, shares, price, current_price, difference, target_price }) => {
          const isGain = parseFloat(difference.split('%')[0]) > 0;
          return (
            <TableRow key={name}>
              <TableCell className="font-medium">{name}</TableCell>
              <TableCell>{shares}</TableCell>
              <TableCell>{price}</TableCell>
              <TableCell>{current_price}</TableCell>
              <TableCell className={isGain ? 'text-green-400' : 'text-red-400'}>{difference}</TableCell>
              <TableCell>{target_price}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </TableContainer>
  );
};

export default Table;

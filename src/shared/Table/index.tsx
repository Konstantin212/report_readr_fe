import { Table as TableContainer, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FFReport } from '@/hooks/useUploadFFReport.ts';

type Props = {
  data: FFReport[];
};

const tableColumns = {
  shares: 'shares',
  name: 'name',
  price: 'price',
  current_price: 'current price',
  difference: 'difference',
  target_price: 'target price',
};

const headers = [
  tableColumns.name,
  tableColumns.shares,
  tableColumns.price,
  tableColumns.current_price,
  tableColumns.difference,
  tableColumns.target_price,
];

const Table = ({ data }: Props) => {
  return (
    <TableContainer>
      <TableHeader>
        <TableRow>
          {headers.map((header) => (
            <TableHead className="capitalize">{header}</TableHead>
          ))}
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

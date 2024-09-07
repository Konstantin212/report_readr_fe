import { DefaultError, useMutation, UseMutationOptions } from '@tanstack/react-query';
import config from '@/config.ts';

export type FFReport = {
  current_price: number;
  difference: string;
  name: string;
  price: number;
  shares: number;
  target_price: string;
};

const useUploadFfReport = (params: UseMutationOptions<FFReport[], DefaultError, FormData>) => {
  return useMutation({
    mutationFn: (formData) =>
      fetch(`${config.API_BASE_URL}${config.ENDPOINTS.API}`, {
        method: 'POST',
        body: formData,
      })
        .then((res) => res.json())
        .then((response) => response.data),
    ...params,
  });
};

export default useUploadFfReport;

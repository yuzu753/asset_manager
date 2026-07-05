delete from products
where btrim(name) = ''
   or lower(btrim(name)) in ('合計', '総計', 'total');

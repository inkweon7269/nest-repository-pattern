import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { PostRepository } from './post.repository';
import { Post } from './entities/post.entity';
import { CreatePostRequestDto } from './dto/request/create-post.request.dto';
import { UpdatePostRequestDto } from './dto/request/update-post.request.dto';

describe('PostRepository', () => {
  let repository: PostRepository;

  const now = new Date();

  const mockPost: Post = {
    id: 1,
    title: 'Test Title',
    content: 'Test Content',
    isPublished: false,
    createdAt: now,
    updatedAt: now,
  };

  const mockTypeOrmRepo = {
    findOneBy: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  const mockDataSource = {
    manager: {
      getRepository: jest.fn().mockReturnValue(mockTypeOrmRepo),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostRepository,
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    repository = module.get<PostRepository>(PostRepository);
    jest.clearAllMocks();
    mockDataSource.manager.getRepository.mockReturnValue(mockTypeOrmRepo);
  });

  describe('findById', () => {
    it('should return a post when found', async () => {
      mockTypeOrmRepo.findOneBy.mockResolvedValue(mockPost);

      const result = await repository.findById(1);

      expect(mockTypeOrmRepo.findOneBy).toHaveBeenCalledWith({ id: 1 });
      expect(result).toEqual(mockPost);
    });

    it('should return null when not found', async () => {
      mockTypeOrmRepo.findOneBy.mockResolvedValue(null);

      const result = await repository.findById(999);

      expect(mockTypeOrmRepo.findOneBy).toHaveBeenCalledWith({ id: 999 });
      expect(result).toBeNull();
    });
  });

  describe('findAll', () => {
    it('should return an array of posts', async () => {
      const posts = [mockPost];
      mockTypeOrmRepo.find.mockResolvedValue(posts);

      const result = await repository.findAll();

      expect(mockTypeOrmRepo.find).toHaveBeenCalled();
      expect(result).toEqual(posts);
    });

    it('should return an empty array when no posts exist', async () => {
      mockTypeOrmRepo.find.mockResolvedValue([]);

      const result = await repository.findAll();

      expect(mockTypeOrmRepo.find).toHaveBeenCalled();
      expect(result).toEqual([]);
    });
  });

  describe('create', () => {
    it('should create and save a post', async () => {
      const dto: CreatePostRequestDto = {
        title: 'New Post',
        content: 'New Content',
      };
      const createdEntity = { ...dto } as Post;
      mockTypeOrmRepo.create.mockReturnValue(createdEntity);
      mockTypeOrmRepo.save.mockResolvedValue({ ...mockPost, ...dto });

      const result = await repository.create(dto);

      expect(mockTypeOrmRepo.create).toHaveBeenCalledWith(dto);
      expect(mockTypeOrmRepo.save).toHaveBeenCalledWith(createdEntity);
      expect(result).toEqual({ ...mockPost, ...dto });
    });
  });

  describe('update', () => {
    it('should update and return the updated post', async () => {
      const dto: UpdatePostRequestDto = { title: 'Updated Title' };
      const updatedPost = { ...mockPost, title: 'Updated Title' };
      mockTypeOrmRepo.update.mockResolvedValue(undefined);
      mockTypeOrmRepo.findOneBy.mockResolvedValue(updatedPost);

      const result = await repository.update(1, dto);

      expect(mockTypeOrmRepo.update).toHaveBeenCalledWith(1, dto);
      expect(mockTypeOrmRepo.findOneBy).toHaveBeenCalledWith({ id: 1 });
      expect(result).toEqual(updatedPost);
    });
  });

  describe('delete', () => {
    it('should delete by id', async () => {
      mockTypeOrmRepo.delete.mockResolvedValue(undefined);

      await repository.delete(1);

      expect(mockTypeOrmRepo.delete).toHaveBeenCalledWith(1);
    });
  });
});
